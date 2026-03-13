import { assertIsoDateString } from "@/src/core/isoDate";
import { scoreMetrics } from "@/src/core/metrics";
import { computeBacktestAttribution } from "@/src/core/backtest/attribution";
import type { PriceBar } from "@/src/core/domain";
import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import {
  getDaaSystemConfig,
  listDaaAssetUniverse,
  patchDaaAssetUniverseRow,
  saveDaaSystemConfig,
} from "@/src/daa/store/daaStorePg";
import { appendStrategyLabRunSnapshot } from "@/src/daa/store/strategyLabSnapshotRepo";
import { createMarketDataClient, type MarketDataClient } from "@/src/market/marketDataClient";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";

import {
  prepareAlignedSeriesBySymbolWithDiagnostics,
  runStrategyLabBacktests,
} from "./strategyLabEngine";
import type {
  StrategyLabCandidateScenarioComparison,
  StrategyLabExecutionGapSourceImpact,
  StrategyLabRunAssetInput,
  StrategyLabRunCandidateView,
  StrategyLabRunConstraintSettings,
  StrategyLabRunExecutionSettings,
  StrategyLabRunInput,
  StrategyLabRunPolicySettings,
  StrategyLabRunResult,
  StrategyLabRunScenarioId,
  StrategyLabRunScenarioView,
  StrategyLabWritebackInput,
  StrategyLabWritebackResult,
} from "./strategyLabContracts";
import type { StrategyLabCandidateId, StrategyLabEnsembleConfig } from "./strategyLabTypes";

const DEFAULT_ENSEMBLE_CONFIG_: StrategyLabEnsembleConfig = {
  momentum: 0.4,
  riskParity: 0.25,
  minVariance: 0.15,
  equalWeight: 0.2,
};

const MAX_FX_CARRY_FORWARD_DAYS_ = 4;

export type StrategyLabValidationReasonCode =
  | "INVALID_START_DATE"
  | "INVALID_END_DATE"
  | "INVALID_DATE_RANGE"
  | "BASE_CURRENCY_MISMATCH"
  | "EMPTY_ASSETS"
  | "MISSING_ASSET_CURRENCY"
  | "MISSING_FX_SERIES"
  | "FX_COVERAGE_GAP"
  | "INSUFFICIENT_HISTORY";

export class StrategyLabValidationError extends Error {
  readonly code: StrategyLabValidationReasonCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: StrategyLabValidationReasonCode,
    message: string,
    options: {
      status?: number;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "StrategyLabValidationError";
    this.code = code;
    this.status = options.status ?? 400;
    this.details = options.details ?? {};
  }
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function joinStrategyLabList(values: string[]): string {
  return values.map((value) => normalizeText(value)).filter(Boolean).join("、");
}

function assertRunDateField(value: string, label: "startDate" | "endDate") {
  try {
    assertIsoDateString(value, label);
  } catch {
    throw new StrategyLabValidationError(
      label === "startDate" ? "INVALID_START_DATE" : "INVALID_END_DATE",
      label === "startDate"
        ? "开始日期格式不正确，请使用 YYYY-MM-DD。"
        : "结束日期格式不正确，请使用 YYYY-MM-DD。",
      {
        details: {
          field: label,
          value,
        },
      },
    );
  }
}

function toPositive(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function toWeight01(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeBenchmarkSymbol(value: unknown): string {
  return normalizeText(value).toUpperCase() || "SPY";
}

function normalizeAssetKey(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function normalizeRunAssets(input: StrategyLabRunAssetInput[]): StrategyLabRunAssetInput[] {
  const out = new Map<string, StrategyLabRunAssetInput>();

  for (const raw of Array.isArray(input) ? input : []) {
    const assetKey = normalizeAssetKey(raw.assetKey);
    const symbol = normalizeText(raw.symbol).toUpperCase();
    const market = normalizeText(raw.market).toUpperCase() || "US";
    if (!assetKey || !symbol) continue;

    out.set(assetKey, {
      assetKey,
      symbol,
      market,
      currency: normalizeDaaCurrencyCode(raw.currency, ""),
      label: normalizeText(raw.label) || symbol,
      yfinanceSymbol: normalizeText(raw.yfinanceSymbol).toUpperCase() || toYfinanceSymbolByMarket(symbol, market),
      currentWeightPct: Math.max(0, Number(raw.currentWeightPct) || 0),
      currentTargetWeightPct: Math.max(0, Number(raw.currentTargetWeightPct) || 0),
      holdingQty: Math.max(0, Number(raw.holdingQty) || 0),
      watchEnabled: raw.watchEnabled === true,
    });
  }

  return [...out.values()];
}

function normalizeEnsembleConfig(input: Partial<StrategyLabEnsembleConfig> | undefined): StrategyLabEnsembleConfig {
  const pick = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
  };

  return {
    momentum: pick(input?.momentum, DEFAULT_ENSEMBLE_CONFIG_.momentum),
    riskParity: pick(input?.riskParity, DEFAULT_ENSEMBLE_CONFIG_.riskParity),
    minVariance: pick(input?.minVariance, DEFAULT_ENSEMBLE_CONFIG_.minVariance),
    equalWeight: pick(input?.equalWeight, DEFAULT_ENSEMBLE_CONFIG_.equalWeight),
  };
}

function buildWeightMap01FromPct(
  assets: StrategyLabRunAssetInput[],
  pick: (asset: StrategyLabRunAssetInput) => number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const asset of assets) {
    const weight = Math.max(0, Number(pick(asset)) || 0) / 100;
    if (weight <= 0) continue;
    out[asset.assetKey] = weight;
  }
  return out;
}

function clamp01(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function toNonNegative(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  return Math.max(0, Math.trunc(toNonNegative(value, fallback)));
}

type StrategyLabDefaults = {
  constraints: StrategyLabRunConstraintSettings;
  policy: StrategyLabRunPolicySettings;
  execution: StrategyLabRunExecutionSettings;
};

function normalizeExecutionSettings(
  input: StrategyLabRunInput["execution"],
  defaults: StrategyLabRunExecutionSettings,
): StrategyLabRunExecutionSettings {
  const feeRateBps = Number.isFinite(Number(input?.feeRateBps))
    ? Number(input?.feeRateBps)
    : (Number.isFinite(Number(input?.feeRatePct)) ? Number(input?.feeRatePct) * 10000 : defaults.feeRateBps);

  return {
    timing: "t_plus_1_close",
    feeRateBps: toNonNegative(feeRateBps, defaults.feeRateBps),
    slippageBps: toNonNegative(input?.slippageBps, defaults.slippageBps),
  };
}

function normalizeConstraintSettings(
  input: StrategyLabRunInput["constraints"],
  defaults: StrategyLabRunConstraintSettings,
): StrategyLabRunConstraintSettings {
  return {
    maxPositionPct: clamp01(input?.maxPositionPct, defaults.maxPositionPct),
    minNotional: toNonNegative(input?.minNotional, defaults.minNotional),
    maxOrderPctOfNav: clamp01(input?.maxOrderPctOfNav, defaults.maxOrderPctOfNav),
  };
}

function normalizePolicySettings(
  input: StrategyLabRunInput["policy"],
  defaults: StrategyLabRunPolicySettings,
): StrategyLabRunPolicySettings {
  return {
    thresholdPct: toNonNegative(input?.thresholdPct, defaults.thresholdPct),
    minTradeNotional: toNonNegative(input?.minTradeNotional, defaults.minTradeNotional),
    cooldownSeconds: toNonNegativeInt(input?.cooldownSeconds, defaults.cooldownSeconds),
  };
}

type StrategyLabScenarioDefinition = StrategyLabRunScenarioView & {
  runtimeConstraints: NonNullable<StrategyLabRunInput["constraints"]>;
  runtimePolicy: NonNullable<StrategyLabRunInput["policy"]>;
  runtimeExecution: StrategyLabRunExecutionSettings;
};

type StrategyLabExecutionBreakdownStageId = "ideal" | "fee" | "slippage" | "tradeFloor" | "executable";

type StrategyLabExecutionBreakdownStageDefinition = {
  stageId: Exclude<StrategyLabExecutionBreakdownStageId, "ideal" | "executable">;
  runtimeConstraints: NonNullable<StrategyLabRunInput["constraints"]>;
  runtimePolicy: NonNullable<StrategyLabRunInput["policy"]>;
  runtimeExecution: StrategyLabRunExecutionSettings;
};

type StrategyLabExecutionBreakdownSourceDefinition = {
  sourceId: StrategyLabExecutionGapSourceImpact["sourceId"];
  label: string;
  description: string;
  fromStageId: StrategyLabExecutionBreakdownStageId;
  toStageId: StrategyLabExecutionBreakdownStageId;
};

type StrategyLabScenarioRuntimeProfile = {
  constraintSettings: StrategyLabRunConstraintSettings;
  policySettings: StrategyLabRunPolicySettings;
  executableConstraints: NonNullable<StrategyLabRunInput["constraints"]>;
  idealConstraints: NonNullable<StrategyLabRunInput["constraints"]>;
  tradeFloorConstraints: NonNullable<StrategyLabRunInput["constraints"]>;
  executablePolicy: NonNullable<StrategyLabRunInput["policy"]>;
  idealPolicy: NonNullable<StrategyLabRunInput["policy"]>;
  tradeFloorPolicy: NonNullable<StrategyLabRunInput["policy"]>;
  executableExecution: StrategyLabRunExecutionSettings;
  feeExecution: StrategyLabRunExecutionSettings;
  slippageExecution: StrategyLabRunExecutionSettings;
  idealExecution: StrategyLabRunExecutionSettings;
};

function formatSettingNumber(value: number, digits = 4): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  const fixed = numeric.toFixed(digits);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function buildScenarioRuntimeProfile(input: StrategyLabRunInput, defaults: StrategyLabDefaults): StrategyLabScenarioRuntimeProfile {
  const constraintSettings = normalizeConstraintSettings(input.constraints, defaults.constraints);
  const policySettings = normalizePolicySettings(input.policy, defaults.policy);
  const executionSettings = normalizeExecutionSettings(input.execution, defaults.execution);
  const assetBlacklist = Array.isArray(input.constraints?.assetBlacklist)
    ? [...new Set(input.constraints.assetBlacklist.map((item) => normalizeAssetKey(item)).filter(Boolean))]
    : undefined;
  const cashSweepToTarget = input.policy?.cashSweepToTarget === true;

  const executableConstraints = {
    ...(assetBlacklist?.length ? { assetBlacklist } : {}),
    ...constraintSettings,
  };
  const idealConstraints = {
    ...(assetBlacklist?.length ? { assetBlacklist } : {}),
    maxPositionPct: constraintSettings.maxPositionPct,
    minNotional: 0,
    maxOrderPctOfNav: 1,
  };
  const tradeFloorConstraints = {
    ...(assetBlacklist?.length ? { assetBlacklist } : {}),
    maxPositionPct: constraintSettings.maxPositionPct,
    minNotional: constraintSettings.minNotional,
    maxOrderPctOfNav: 1,
  };
  const executablePolicy = {
    thresholdPct: policySettings.thresholdPct,
    minTradeNotional: policySettings.minTradeNotional,
    cooldownSeconds: policySettings.cooldownSeconds,
    ...(cashSweepToTarget ? { cashSweepToTarget: true } : {}),
  };
  const idealPolicy = {
    thresholdPct: policySettings.thresholdPct,
    minTradeNotional: 0,
    cooldownSeconds: policySettings.cooldownSeconds,
    ...(cashSweepToTarget ? { cashSweepToTarget: true } : {}),
  };
  const tradeFloorPolicy = {
    thresholdPct: policySettings.thresholdPct,
    minTradeNotional: policySettings.minTradeNotional,
    cooldownSeconds: policySettings.cooldownSeconds,
    ...(cashSweepToTarget ? { cashSweepToTarget: true } : {}),
  };
  const executableExecution = executionSettings;
  const feeExecution = {
    timing: executionSettings.timing,
    feeRateBps: executionSettings.feeRateBps,
    slippageBps: 0,
  } satisfies StrategyLabRunExecutionSettings;
  const slippageExecution = {
    timing: executionSettings.timing,
    feeRateBps: executionSettings.feeRateBps,
    slippageBps: executionSettings.slippageBps,
  } satisfies StrategyLabRunExecutionSettings;
  const idealExecution = {
    timing: executionSettings.timing,
    feeRateBps: 0,
    slippageBps: 0,
  } satisfies StrategyLabRunExecutionSettings;

  return {
    constraintSettings,
    policySettings,
    executableConstraints,
    idealConstraints,
    tradeFloorConstraints,
    executablePolicy,
    idealPolicy,
    tradeFloorPolicy,
    executableExecution,
    feeExecution,
    slippageExecution,
    idealExecution,
  };
}

function buildScenarioDefinitions(runtime: StrategyLabScenarioRuntimeProfile): StrategyLabScenarioDefinition[] {
  return [
    {
      scenarioId: "executable",
      label: "可执行回测",
      description: "按工作台同口径的执行约束、费用率与滑点模拟，更接近真实落地结果。",
      assumptions: [
        "保留仓位上限、漂移阈值与冷却窗口。",
        "应用最小成交额、单笔 NAV 上限、费用率与滑点。",
        "成交时点固定为 T+1 close。",
      ],
      constraints: runtime.constraintSettings,
      policy: runtime.policySettings,
      execution: runtime.executableExecution,
      candidates: [],
      bestCandidateId: null,
      warnings: [],
      runtimeConstraints: runtime.executableConstraints,
      runtimePolicy: runtime.executablePolicy,
      runtimeExecution: runtime.executableExecution,
    },
    {
      scenarioId: "ideal",
      label: "理想回测",
      description: "移除主要执行摩擦，用来观察同一条目标权重时间轴在低摩擦环境下的上限表现。",
      assumptions: [
        "保留仓位上限、漂移阈值与冷却窗口。",
        "忽略最小成交额、单笔 NAV 上限、费用率与滑点。",
        "成交时点固定为 T+1 close。",
      ],
      constraints: {
        ...runtime.constraintSettings,
        minNotional: 0,
        maxOrderPctOfNav: 1,
      },
      policy: {
        ...runtime.policySettings,
        minTradeNotional: 0,
      },
      execution: runtime.idealExecution,
      candidates: [],
      bestCandidateId: null,
      warnings: [],
      runtimeConstraints: runtime.idealConstraints,
      runtimePolicy: runtime.idealPolicy,
      runtimeExecution: runtime.idealExecution,
    },
  ];
}

function buildExecutionBreakdownStageDefinitions(runtime: StrategyLabScenarioRuntimeProfile): StrategyLabExecutionBreakdownStageDefinition[] {
  return [
    {
      stageId: "fee",
      runtimeConstraints: runtime.idealConstraints,
      runtimePolicy: runtime.idealPolicy,
      runtimeExecution: runtime.feeExecution,
    },
    {
      stageId: "slippage",
      runtimeConstraints: runtime.idealConstraints,
      runtimePolicy: runtime.idealPolicy,
      runtimeExecution: runtime.slippageExecution,
    },
    {
      stageId: "tradeFloor",
      runtimeConstraints: runtime.tradeFloorConstraints,
      runtimePolicy: runtime.tradeFloorPolicy,
      runtimeExecution: runtime.slippageExecution,
    },
  ];
}

function buildExecutionBreakdownSourceDefinitions(runtime: StrategyLabScenarioRuntimeProfile): StrategyLabExecutionBreakdownSourceDefinition[] {
  return [
    {
      sourceId: "fee",
      label: "费用",
      description: `在理想回测基础上恢复费用率 ${formatSettingNumber(runtime.executableExecution.feeRateBps, 2)} bps。`,
      fromStageId: "ideal",
      toStageId: "fee",
    },
    {
      sourceId: "slippage",
      label: "滑点",
      description: `在费用已生效的前提下恢复滑点 ${formatSettingNumber(runtime.executableExecution.slippageBps, 2)} bps。`,
      fromStageId: "fee",
      toStageId: "slippage",
    },
    {
      sourceId: "tradeFloor",
      label: "成交门槛",
      description: `恢复最小成交额 ${formatSettingNumber(runtime.constraintSettings.minNotional, 2)} 与策略最小调仓额 ${formatSettingNumber(runtime.policySettings.minTradeNotional, 2)}。`,
      fromStageId: "slippage",
      toStageId: "tradeFloor",
    },
    {
      sourceId: "tradeCaps",
      label: "单次上限",
      description: `恢复单笔 NAV 上限 ${formatSettingNumber(runtime.constraintSettings.maxOrderPctOfNav * 100, 2)}%。`,
      fromStageId: "tradeFloor",
      toStageId: "executable",
    },
  ];
}

function buildScenarioCandidateViews(input: {
  run: ReturnType<typeof runStrategyLabBacktests>;
  benchmarkSymbol: string;
  benchmarkSeriesForMetrics: PriceBar[];
  seriesForAttribution: Record<string, PriceBar[]>;
}): StrategyLabRunCandidateView[] {
  return input.run.candidates.map((candidate) => {
    const attribution = computeBacktestAttribution({
      backtest: candidate.backtest,
      seriesBySymbol: input.seriesForAttribution,
      benchmarkSymbol: input.benchmarkSymbol,
      benchmarkSeries: input.benchmarkSeriesForMetrics,
    });

    return {
      ...candidate,
      score: scoreMetrics(candidate.backtest.metrics),
      attribution: {
        ...attribution,
        perAsset: attribution.perAsset.filter((row) => row.symbol !== input.benchmarkSymbol),
      },
    };
  });
}

function pickBestCandidateId(candidates: StrategyLabRunCandidateView[]): StrategyLabRunScenarioView["bestCandidateId"] {
  const bestCandidate = [...candidates].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0] || null;
  return bestCandidate?.id || null;
}

function buildCandidateRankMap(candidates: StrategyLabRunCandidateView[]): Map<StrategyLabCandidateId, number> {
  const sorted = [...candidates].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return new Map(sorted.map((candidate, index) => [candidate.id, index + 1] as const));
}

function findCandidateInRun(
  run: ReturnType<typeof runStrategyLabBacktests> | undefined,
  candidateId: StrategyLabCandidateId,
) {
  return run?.candidates.find((candidate) => candidate.id === candidateId) || null;
}

function buildCandidateScenarioComparisons(input: {
  scenarios: StrategyLabRunScenarioView[];
  breakdownRuns: Map<StrategyLabExecutionBreakdownStageId, ReturnType<typeof runStrategyLabBacktests>>;
  sourceDefinitions: StrategyLabExecutionBreakdownSourceDefinition[];
}): StrategyLabCandidateScenarioComparison[] {
  const idealScenario = input.scenarios.find((scenario) => scenario.scenarioId === "ideal") || null;
  const executableScenario = input.scenarios.find((scenario) => scenario.scenarioId === "executable") || null;
  if (!idealScenario || !executableScenario) return [];

  const idealRankMap = buildCandidateRankMap(idealScenario.candidates);
  const executableRankMap = buildCandidateRankMap(executableScenario.candidates);
  const candidateIds = [...new Set([
    ...idealScenario.candidates.map((candidate) => candidate.id),
    ...executableScenario.candidates.map((candidate) => candidate.id),
  ])];

  return candidateIds.flatMap((candidateId) => {
    const idealCandidate = idealScenario.candidates.find((candidate) => candidate.id === candidateId) || null;
    const executableCandidate = executableScenario.candidates.find((candidate) => candidate.id === candidateId) || null;
    if (!idealCandidate || !executableCandidate) return [];

    const idealRank = idealRankMap.get(candidateId) || null;
    const executableRank = executableRankMap.get(candidateId) || null;
    const sourceBreakdown: StrategyLabExecutionGapSourceImpact[] = input.sourceDefinitions.flatMap((source) => {
      const fromCandidate = findCandidateInRun(input.breakdownRuns.get(source.fromStageId), candidateId);
      const toCandidate = findCandidateInRun(input.breakdownRuns.get(source.toStageId), candidateId);
      if (!fromCandidate || !toCandidate) return [];
      return [{
        sourceId: source.sourceId,
        label: source.label,
        description: source.description,
        returnImpact: fromCandidate.backtest.metrics.totalReturn - toCandidate.backtest.metrics.totalReturn,
        sharpeImpact: fromCandidate.backtest.metrics.sharpe - toCandidate.backtest.metrics.sharpe,
        turnoverDelta: toCandidate.backtest.summary.turnoverNotional - fromCandidate.backtest.summary.turnoverNotional,
        rebalanceDelta: toCandidate.backtest.summary.rebalanceCount - fromCandidate.backtest.summary.rebalanceCount,
      } satisfies StrategyLabExecutionGapSourceImpact];
    });

    return [{
      candidateId,
      idealRank,
      executableRank,
      rankDelta: idealRank && executableRank ? executableRank - idealRank : null,
      executionGap: idealCandidate.backtest.metrics.totalReturn - executableCandidate.backtest.metrics.totalReturn,
      sharpeGap: idealCandidate.backtest.metrics.sharpe - executableCandidate.backtest.metrics.sharpe,
      turnoverDelta: executableCandidate.backtest.summary.turnoverNotional - idealCandidate.backtest.summary.turnoverNotional,
      rebalanceDelta: executableCandidate.backtest.summary.rebalanceCount - idealCandidate.backtest.summary.rebalanceCount,
      sourceBreakdown,
    } satisfies StrategyLabCandidateScenarioComparison];
  });
}

function normalizePriceSeries(series: PriceBar[]): PriceBar[] {
  const deduped = new Map<string, number>();
  for (const bar of series || []) {
    const date = normalizeText(bar.date);
    const close = Number(bar.close);
    if (!date || !(close > 0)) continue;
    deduped.set(date, close);
  }
  return [...deduped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, close]) => ({ date, close }));
}

function buildBenchmarkCurveAgainstDates(input: {
  series: PriceBar[];
  dates: string[];
}): {
  dates: string[];
  equity: Array<number | null>;
  totalReturn: number | null;
  coverage: "full" | "partial" | "missing";
} {
  const dates = (input.dates || []).map((date) => normalizeText(date)).filter(Boolean);
  if (dates.length < 2) {
    return { dates: [], equity: [], totalReturn: null, coverage: "missing" };
  }

  const series = normalizePriceSeries(input.series);
  if (series.length < 2) {
    return {
      dates: dates.slice(1),
      equity: dates.slice(1).map(() => null),
      totalReturn: null,
      coverage: "missing",
    };
  }

  const firstSeriesDate = series[0]?.date || "";
  const lastSeriesDate = series[series.length - 1]?.date || "";
  const horizonStart = dates[0];
  const horizonEnd = dates[dates.length - 1];

  let pointer = 0;
  let carriedClose: number | undefined;
  while (pointer < series.length && series[pointer].date <= horizonStart) {
    carriedClose = series[pointer].close;
    pointer += 1;
  }

  let prevClose = carriedClose;
  let equityValue = 1;
  const equity: Array<number | null> = [];
  for (let i = 1; i < dates.length; i += 1) {
    while (pointer < series.length && series[pointer].date <= dates[i]) {
      carriedClose = series[pointer].close;
      pointer += 1;
    }
    const currentClose = dates[i] <= lastSeriesDate ? carriedClose : undefined;
    if (prevClose && prevClose > 0 && currentClose && currentClose > 0) {
      equityValue *= currentClose / prevClose;
      equity.push(equityValue);
    } else {
      equity.push(null);
    }
    if (currentClose && currentClose > 0) {
      prevClose = currentClose;
    }
  }

  const coverage = firstSeriesDate <= horizonStart && lastSeriesDate >= horizonEnd && carriedClose && carriedClose > 0 && prevClose && prevClose > 0
    ? "full"
    : "partial";
  const totalReturn = coverage === "full" && equity.length > 0 && equity[equity.length - 1] !== null ? (equity[equity.length - 1] as number) - 1 : null;

  return {
    dates: dates.slice(1),
    equity,
    totalReturn,
    coverage,
  };
}

async function fetchSeriesMap(input: {
  client: MarketDataClient;
  assets: StrategyLabRunAssetInput[];
  startDate: string;
  endDate: string;
}): Promise<{ rawSeriesByAssetKey: Record<string, PriceBar[]>; warnings: string[] }> {
  const warnings: string[] = [];
  const rawSeriesByAssetKey: Record<string, PriceBar[]> = {};

  const settled = await Promise.allSettled(
    input.assets.map(async (asset) => {
      const yfinanceSymbol = normalizeText(asset.yfinanceSymbol).toUpperCase();
      if (!yfinanceSymbol) {
        throw new Error(`${asset.symbol} 缺少可用行情代码`);
      }
      const series = await input.client.yfinance.priceSeriesBars({
        symbol: yfinanceSymbol,
        start: input.startDate,
        end: input.endDate,
        adjusted: true,
      });
      return { asset, series };
    }),
  );

  for (const item of settled) {
    if (item.status === "fulfilled") {
      rawSeriesByAssetKey[item.value.asset.assetKey] = item.value.series;
      continue;
    }
    const message = item.reason instanceof Error ? item.reason.message : String(item.reason || "unknown_error");
    warnings.push(message);
  }

  return { rawSeriesByAssetKey, warnings };
}

async function fetchBenchmarkSeries(input: {
  client: MarketDataClient;
  benchmarkSymbol: string;
  startDate: string;
  endDate: string;
}): Promise<{ series: PriceBar[]; warning?: string }> {
  try {
    const series = await input.client.yfinance.priceSeriesBars({
      symbol: input.benchmarkSymbol,
      start: input.startDate,
      end: input.endDate,
      adjusted: true,
    });
    return { series };
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error || "benchmark_fetch_failed");
    return { series: [], warning };
  }
}

type FxPointToBase = {
  date: string;
  rate: number;
};

type FxSeriesToBase = {
  currency: string;
  symbol: string;
  inverted: boolean;
  rateByDate: Map<string, number>;
  points: FxPointToBase[];
};

function buildFxSymbolCandidates(localCurrency: string, baseCurrency: string): Array<{ symbol: string; inverted: boolean }> {
  const local = normalizeDaaCurrencyCode(localCurrency, "");
  const base = normalizeDaaCurrencyCode(baseCurrency, "USD");
  if (!local || !base || local === base) return [];
  return [
    { symbol: `${local}${base}=X`, inverted: false },
    { symbol: `${base}${local}=X`, inverted: true },
  ];
}

async function fetchFxSeriesForCurrency(input: {
  client: MarketDataClient;
  currency: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
}): Promise<FxSeriesToBase | null> {
  const currency = normalizeDaaCurrencyCode(input.currency, "");
  const baseCurrency = normalizeDaaCurrencyCode(input.baseCurrency, "USD");
  if (!currency || currency === baseCurrency) {
    return {
      currency: baseCurrency,
      symbol: `${baseCurrency}/${baseCurrency}`,
      inverted: false,
      rateByDate: new Map<string, number>(),
      points: [],
    };
  }

  for (const candidate of buildFxSymbolCandidates(currency, baseCurrency)) {
    try {
      const series = await input.client.yfinance.priceSeriesBars({
        symbol: candidate.symbol,
        start: input.startDate,
        end: input.endDate,
        adjusted: false,
      });
      const rateByDate = new Map<string, number>();
      const points: FxPointToBase[] = [];
      for (const bar of series) {
        const date = normalizeText(bar.date);
        const close = Number(bar.close);
        if (!date || !(close > 0)) continue;
        const rate = candidate.inverted ? (1 / close) : close;
        if (!(Number.isFinite(rate) && rate > 0)) continue;
        rateByDate.set(date, rate);
        points.push({ date, rate });
      }
      if (rateByDate.size > 0) {
        return {
          currency,
          symbol: candidate.symbol,
          inverted: candidate.inverted,
          rateByDate,
          points,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchFxSeriesToBaseMap(input: {
  client: MarketDataClient;
  currencies: string[];
  baseCurrency: string;
  startDate: string;
  endDate: string;
}): Promise<{ fxByCurrency: Map<string, FxSeriesToBase>; missingCurrencies: string[] }> {
  const baseCurrency = normalizeDaaCurrencyCode(input.baseCurrency, "USD");
  const currencies = [...new Set((input.currencies || []).map((item) => normalizeDaaCurrencyCode(item, "")).filter(Boolean))]
    .filter((currency) => currency !== baseCurrency)
    .sort();

  const fxByCurrency = new Map<string, FxSeriesToBase>();
  const missingCurrencies: string[] = [];

  const settled = await Promise.allSettled(
    currencies.map(async (currency) => ({
      currency,
      fx: await fetchFxSeriesForCurrency({
        client: input.client,
        currency,
        baseCurrency,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    })),
  );

  for (const item of settled) {
    if (item.status !== "fulfilled" || !item.value.fx) {
      const currency = item.status === "fulfilled" ? item.value.currency : "UNKNOWN";
      missingCurrencies.push(currency);
      continue;
    }
    fxByCurrency.set(item.value.currency, item.value.fx);
  }

  return { fxByCurrency, missingCurrencies };
}

function diffCalendarDays(laterDate: string, earlierDate: string): number {
  const later = Date.parse(`${laterDate}T00:00:00Z`);
  const earlier = Date.parse(`${earlierDate}T00:00:00Z`);
  if (!(Number.isFinite(later) && Number.isFinite(earlier))) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((later - earlier) / 86400000));
}

function convertSeriesToBaseCurrency(input: {
  label: string;
  currency: string;
  baseCurrency: string;
  series: PriceBar[];
  fxByCurrency: Map<string, FxSeriesToBase>;
}): { series: PriceBar[]; missingDates: string[] } {
  const localCurrency = normalizeDaaCurrencyCode(input.currency, "");
  const baseCurrency = normalizeDaaCurrencyCode(input.baseCurrency, "USD");
  if (!localCurrency) {
    return { series: [], missingDates: ["currency_missing"] };
  }
  if (localCurrency === baseCurrency) {
    return {
      series: (input.series || []).map((bar) => ({ date: String(bar.date), close: Number(bar.close) })),
      missingDates: [],
    };
  }

  const fx = input.fxByCurrency.get(localCurrency);
  if (!fx) {
    return { series: [], missingDates: ["fx_series_missing"] };
  }

  const converted: PriceBar[] = [];
  const missingDates: string[] = [];
  const points = [...(fx.points || [])].sort((left, right) => left.date.localeCompare(right.date));
  let pointIndex = 0;
  let latestPoint: FxPointToBase | null = null;

  for (const bar of input.series || []) {
    const date = normalizeText(bar.date);
    const close = Number(bar.close);
    if (!date || !(close > 0)) continue;

    while (pointIndex < points.length && points[pointIndex].date <= date) {
      latestPoint = points[pointIndex];
      pointIndex += 1;
    }

    const exactRate = fx.rateByDate.get(date);
    const effectivePoint = Number.isFinite(exactRate) && (exactRate as number) > 0
      ? { date, rate: exactRate as number }
      : latestPoint;
    if (!effectivePoint || diffCalendarDays(date, effectivePoint.date) > MAX_FX_CARRY_FORWARD_DAYS_) {
      missingDates.push(date);
      continue;
    }
    converted.push({ date, close: close * effectivePoint.rate });
  }

  return { series: converted, missingDates };
}

function inferBenchmarkCurrency(symbolRaw: string): string {
  const symbol = normalizeText(symbolRaw).toUpperCase();
  if (symbol.endsWith(".HK")) return "HKD";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CNY";
  return "USD";
}

export async function runStrategyLab(
  input: StrategyLabRunInput,
  deps: { marketDataClient?: MarketDataClient; endpointBase?: string } = {},
): Promise<StrategyLabRunResult> {
  assertRunDateField(input.startDate, "startDate");
  assertRunDateField(input.endDate, "endDate");
  if (input.endDate < input.startDate) {
    throw new StrategyLabValidationError(
      "INVALID_DATE_RANGE",
      "结束日期不能早于开始日期。",
      {
        details: {
          startDate: input.startDate,
          endDate: input.endDate,
        },
      },
    );
  }

  const systemRow = await getDaaSystemConfig();
  const baseCurrency = normalizeDaaCurrencyCode(systemRow.config.strategy.account.baseCurrency, "USD");
  const requestedBaseCurrency = input.baseCurrency
    ? normalizeDaaCurrencyCode(input.baseCurrency, baseCurrency)
    : baseCurrency;
  if (input.baseCurrency && requestedBaseCurrency !== baseCurrency) {
    throw new StrategyLabValidationError(
      "BASE_CURRENCY_MISMATCH",
      `当前系统基准货币是 ${baseCurrency}，本轮研究不能直接改成 ${requestedBaseCurrency}；请按系统基准货币回测。`,
      {
        details: {
          expectedBaseCurrency: baseCurrency,
          requestedBaseCurrency,
        },
      },
    );
  }

  const assets = normalizeRunAssets(input.assets);
  if (!assets.length) {
    throw new StrategyLabValidationError("EMPTY_ASSETS", "请至少选择 1 个研究资产后再运行策略实验室。");
  }

  const missingCurrencyAssets = assets.filter((asset) => !asset.currency).map((asset) => asset.assetKey);
  if (missingCurrencyAssets.length > 0) {
    throw new StrategyLabValidationError(
      "MISSING_ASSET_CURRENCY",
      `以下资产缺少币种字段，暂时无法做跨币种回测：${joinStrategyLabList(missingCurrencyAssets)}`,
      {
        details: {
          baseCurrency,
          assetKeys: missingCurrencyAssets,
        },
      },
    );
  }

  const client = deps.marketDataClient || createMarketDataClient({ endpointBase: deps.endpointBase });
  const warnings: string[] = [];

  const { rawSeriesByAssetKey, warnings: fetchWarnings } = await fetchSeriesMap({
    client,
    assets,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  warnings.push(...fetchWarnings);

  const lookbackBars = Math.max(2, Math.trunc(Number(input.lookbackBars) || 252));
  const benchmarkSymbol = normalizeBenchmarkSymbol(input.benchmarkSymbol);
  const benchmarkCurrency = inferBenchmarkCurrency(benchmarkSymbol);

  const requiredCurrencies = [
    ...assets.map((asset) => asset.currency),
    ...(benchmarkCurrency !== baseCurrency ? [benchmarkCurrency] : []),
  ];
  const fxFetch = await fetchFxSeriesToBaseMap({
    client,
    currencies: requiredCurrencies,
    baseCurrency,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const assetMissingFxCurrencies = [...new Set(assets.map((asset) => asset.currency))]
    .filter((currency) => normalizeDaaCurrencyCode(currency, baseCurrency) !== baseCurrency)
    .filter((currency) => fxFetch.missingCurrencies.includes(normalizeDaaCurrencyCode(currency, "")));
  if (assetMissingFxCurrencies.length > 0) {
    throw new StrategyLabValidationError(
      "MISSING_FX_SERIES",
      `本轮回测需要把 ${joinStrategyLabList(assetMissingFxCurrencies)} 统一换算成 ${baseCurrency}，但历史 FX 日线缺失，暂时无法继续。`,
      {
        details: {
          baseCurrency,
          currencies: assetMissingFxCurrencies,
        },
      },
    );
  }

  const rawSeriesInBaseByAssetKey: Record<string, PriceBar[]> = {};
  const fxCoverageErrors: string[] = [];
  for (const asset of assets) {
    const series = rawSeriesByAssetKey[asset.assetKey] || [];
    const converted = convertSeriesToBaseCurrency({
      label: asset.assetKey,
      currency: asset.currency,
      baseCurrency,
      series,
      fxByCurrency: fxFetch.fxByCurrency,
    });
    if (converted.missingDates.length > 0) {
      const sample = converted.missingDates.slice(0, 3).join(", ");
      fxCoverageErrors.push(`${asset.assetKey}(${asset.currency}): ${sample}${converted.missingDates.length > 3 ? " ..." : ""}`);
      continue;
    }
    rawSeriesInBaseByAssetKey[asset.assetKey] = converted.series;
  }
  if (fxCoverageErrors.length > 0) {
    throw new StrategyLabValidationError(
      "FX_COVERAGE_GAP",
      `所选时间内的历史汇率覆盖不足，以下资产暂时无法完成换算：${fxCoverageErrors.join("；")}`,
      {
        details: {
          baseCurrency,
          assets: fxCoverageErrors,
        },
      },
    );
  }

  const alignmentMode = input.alignmentMode === "ffill_union" ? "ffill_union" : "intersection";
  const minBars = Math.max(2, Math.trunc(Number(input.minBars) || 80));
  const prepared = prepareAlignedSeriesBySymbolWithDiagnostics(rawSeriesInBaseByAssetKey, {
    mode: alignmentMode,
    minBars,
  });

  const keptAssets = assets.filter((asset) => Array.isArray(prepared.seriesBySymbol[asset.assetKey]) && prepared.seriesBySymbol[asset.assetKey].length >= 2);
  if (!keptAssets.length) {
    throw new StrategyLabValidationError(
      "INSUFFICIENT_HISTORY",
      "所选区间内可对齐的历史行情不足，暂时无法完成回测；请缩短时间区间或更换资产。",
      {
        details: {
          requestedAssetKeys: assets.map((asset) => asset.assetKey),
          lookbackBars,
          commonDateCount: prepared.diagnostics.commonDateCount,
        },
      },
    );
  }

  const currentTargetWeights = buildWeightMap01FromPct(keptAssets, (asset) => asset.currentTargetWeightPct || 0);
  const currentActualWeights = buildWeightMap01FromPct(keptAssets, (asset) => asset.currentWeightPct || 0);
  const ensembleConfig = normalizeEnsembleConfig(input.ensembleConfig);
  const initialEquity = toPositive(input.initialEquity, 100000);
  const executionDefaults = getStrategyExecutionConfig(systemRow.config);
  const runtimeDefaults: StrategyLabDefaults = {
    constraints: {
      maxPositionPct: systemRow.config.strategy.constraints.maxPositionPct,
      minNotional: systemRow.config.strategy.constraints.minNotional,
      maxOrderPctOfNav: executionDefaults.maxOrderPctOfNav,
    },
    policy: {
      thresholdPct: Math.max(0, Number(systemRow.config.rebalanceStrategy.drift.thresholdPct) || 0),
      minTradeNotional: Math.max(0, Number(systemRow.config.strategy.constraints.minNotional) || 0),
      cooldownSeconds: Math.max(0, Math.trunc((Number(systemRow.config.rebalanceStrategy.cooldownHours) || 0) * 3600)),
    },
    execution: {
      timing: executionDefaults.timing,
      feeRateBps: executionDefaults.feeRateBps,
      slippageBps: executionDefaults.slippageBps,
    },
  };
  const runtimeProfile = buildScenarioRuntimeProfile(input, runtimeDefaults);
  const scenarioDefinitions = buildScenarioDefinitions(runtimeProfile);
  const breakdownStageDefinitions = buildExecutionBreakdownStageDefinitions(runtimeProfile);
  const breakdownSourceDefinitions = buildExecutionBreakdownSourceDefinitions(runtimeProfile);

  const runBacktestWithRuntime = (runtime: {
    runtimeConstraints: NonNullable<StrategyLabRunInput["constraints"]>;
    runtimePolicy: NonNullable<StrategyLabRunInput["policy"]>;
    runtimeExecution: StrategyLabRunExecutionSettings;
  }) => runStrategyLabBacktests({
    seriesBySymbol: prepared.seriesBySymbol,
    observedDatesBySymbol: prepared.observedDatesBySymbol,
    executableDatesBySymbol: prepared.observedDatesBySymbol,
    baselineTargetWeights: currentTargetWeights,
    ensembleConfig,
    lookbackBars,
    initialEquity,
    constraints: runtime.runtimeConstraints,
    policy: runtime.runtimePolicy,
    execution: runtime.runtimeExecution,
  });

  const scenarioRuns = scenarioDefinitions.map((scenario) => ({
    ...scenario,
    run: runBacktestWithRuntime(scenario),
  }));

  const breakdownRuns = new Map<StrategyLabExecutionBreakdownStageId, ReturnType<typeof runStrategyLabBacktests>>();
  for (const scenario of scenarioRuns) {
    breakdownRuns.set(scenario.scenarioId, scenario.run);
  }
  for (const stage of breakdownStageDefinitions) {
    breakdownRuns.set(stage.stageId, runBacktestWithRuntime(stage));
  }

  const masterDates = scenarioRuns[0]?.run.symbols.length
    ? (scenarioRuns[0].run.seriesBySymbol[scenarioRuns[0].run.symbols[0]] || []).map((bar) => bar.date)
    : [];
  const benchmarkResult = await fetchBenchmarkSeries({
    client,
    benchmarkSymbol,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (benchmarkResult.warning) warnings.push(`基准 ${benchmarkSymbol}: ${benchmarkResult.warning}`);

  let benchmarkSeriesInBase: PriceBar[] = [];
  if (benchmarkResult.series.length > 0) {
    const convertedBenchmark = convertSeriesToBaseCurrency({
      label: benchmarkSymbol,
      currency: benchmarkCurrency,
      baseCurrency,
      series: benchmarkResult.series,
      fxByCurrency: fxFetch.fxByCurrency,
    });
    if (convertedBenchmark.missingDates.length > 0) {
      warnings.push(`基准 ${benchmarkSymbol} 缺少 FX 覆盖，已跳过基准曲线展示`);
    } else {
      benchmarkSeriesInBase = convertedBenchmark.series;
    }
  }

  const benchmarkCurve = buildBenchmarkCurveAgainstDates({
    series: benchmarkSeriesInBase,
    dates: masterDates,
  });

  const seriesForAttribution: Record<string, PriceBar[]> = {
    ...prepared.seriesBySymbol,
  };

  const scenarios: StrategyLabRunScenarioView[] = scenarioRuns.map((scenario) => {
    const candidates = buildScenarioCandidateViews({
      run: scenario.run,
      benchmarkSymbol,
      benchmarkSeriesForMetrics: benchmarkSeriesInBase,
      seriesForAttribution,
    });

    return {
      scenarioId: scenario.scenarioId,
      label: scenario.label,
      description: scenario.description,
      assumptions: scenario.assumptions,
      constraints: scenario.constraints,
      policy: scenario.policy,
      execution: scenario.execution,
      candidates,
      bestCandidateId: pickBestCandidateId(candidates),
      warnings: scenario.warnings,
    };
  });

  const candidateComparisons = buildCandidateScenarioComparisons({
    scenarios,
    breakdownRuns,
    sourceDefinitions: breakdownSourceDefinitions,
  });

  const defaultScenarioId: StrategyLabRunScenarioId = "executable";
  const defaultScenario = scenarios.find((scenario) => scenario.scenarioId === defaultScenarioId) || scenarios[0];

  if (prepared.diagnostics.droppedSymbols.length > 0) {
    warnings.push(`已剔除 ${prepared.diagnostics.droppedSymbols.length} 个历史数据不足的资产`);
  }
  if (prepared.diagnostics.commonDateCount <= lookbackBars) {
    warnings.push(`当前对齐样本仅有 ${prepared.diagnostics.commonDateCount} 个 bar，尚不足以形成 ${lookbackBars} bar 的首个 walk-forward 决策窗口。`);
  }
  if (alignmentMode === "ffill_union") {
    warnings.push("ffill_union 下图表按并集前值填充对齐展示；统计输入与成交执行仅使用真实观测 bar。");
  }
  if (benchmarkCurve.coverage === "partial") {
    warnings.push(`基准 ${benchmarkSymbol} 未完整覆盖样本区间；图表仅在可估值区间展示，benchmark totalReturn 与 activeReturn 已隐藏。`);
  } else if (benchmarkCurve.coverage === "missing") {
    warnings.push(`基准 ${benchmarkSymbol} 缺少足够真实覆盖；图表与 benchmark 对比指标已隐藏。`);
  }

  const result: StrategyLabRunResult = {
    generatedAt: new Date().toISOString(),
    benchmark: {
      symbol: benchmarkSymbol,
      dates: benchmarkCurve.dates,
      equity: benchmarkCurve.equity,
      totalReturn: benchmarkCurve.totalReturn,
      coverage: benchmarkCurve.coverage,
    },
    baseCurrency,
    lookbackBars,
    assetsUsed: keptAssets,
    diagnostics: prepared.diagnostics,
    currentTargetWeights,
    currentActualWeights,
    scenarios,
    candidateComparisons,
    defaultScenarioId,
    candidates: defaultScenario?.candidates || [],
    bestCandidateId: defaultScenario?.bestCandidateId || null,
    warnings,
  };

  await appendStrategyLabRunSnapshot({
    baseCurrency,
    startDate: input.startDate,
    endDate: input.endDate,
    requestJson: {
      startDate: input.startDate,
      endDate: input.endDate,
      benchmarkSymbol,
      alignmentMode,
      minBars,
      lookbackBars,
      initialEquity: input.initialEquity,
      baseCurrency: requestedBaseCurrency,
      assets: assets.map((asset) => ({
        assetKey: asset.assetKey,
        symbol: asset.symbol,
        market: asset.market,
        currency: asset.currency,
      })),
      constraints: input.constraints,
      policy: input.policy,
      execution: input.execution,
    },
    summaryJson: {
      generatedAt: result.generatedAt,
      baseCurrency: result.baseCurrency,
      assetsUsedCount: result.assetsUsed.length,
      benchmarkSymbol: result.benchmark.symbol,
      candidateCount: result.candidates.length,
      scenarioCount: result.scenarios.length,
      bestCandidateId: result.bestCandidateId,
      defaultScenarioId: result.defaultScenarioId,
      warningCount: result.warnings.length,
    },
  });

  return result;
}

export async function writeStrategyLabTargetWeights(
  input: StrategyLabWritebackInput,
): Promise<StrategyLabWritebackResult> {
  const candidateId = input.candidateId;
  const scopeAssetKeys = [...new Set((Array.isArray(input.scopeAssetKeys) ? input.scopeAssetKeys : []).map((item) => normalizeAssetKey(item)).filter(Boolean))];
  if (!scopeAssetKeys.length) {
    throw new Error("scopeAssetKeys is required");
  }

  const weightMap: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(input.weightsByAssetKey || {})) {
    const assetKey = normalizeAssetKey(rawKey);
    if (!assetKey) continue;
    weightMap[assetKey] = toWeight01(rawValue);
  }

  const rows = await listDaaAssetUniverse();
  const rowByKey = new Map(rows.map((row) => [normalizeAssetKey(row.assetKey), row] as const));
  const updatedAssetKeys: string[] = [];

  for (const assetKey of scopeAssetKeys) {
    const row = rowByKey.get(assetKey);
    if (!row) continue;
    const nextWeight = toWeight01(weightMap[assetKey]);
    const nextWatchEnabled = nextWeight > 0 ? true : row.watchEnabled;
    const unchanged = Math.abs((row.targetWeightHint || 0) - nextWeight) <= 1e-8 && row.watchEnabled === nextWatchEnabled;
    if (unchanged) continue;

    await patchDaaAssetUniverseRow({
      assetKey,
      targetWeightHint: nextWeight,
      watchEnabled: nextWatchEnabled,
    });
    updatedAssetKeys.push(assetKey);
  }

  const system = await getDaaSystemConfig();
  const hasConfigTargetWeights = Object.keys(system.config.strategy?.targetWeights || {}).length > 0;
  if (hasConfigTargetWeights) {
    await saveDaaSystemConfig({
      baseVersion: system.version,
      config: {
        ...system.config,
        strategy: {
          ...system.config.strategy,
          targetWeights: {},
        },
      },
    });
  }

  return {
    candidateId,
    updatedAssetKeys,
    updatedCount: updatedAssetKeys.length,
    clearedConfigTargetWeights: hasConfigTargetWeights,
    wroteAt: new Date().toISOString(),
  };
}
