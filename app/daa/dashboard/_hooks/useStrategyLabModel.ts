"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/src/daa/api/client";
import { buildTargetWeightDiffRows } from "@/src/daa/modules/strategyLab/strategyLabEngine";
import { runStrategyLabApi, writeStrategyLabTargetWeightsApi } from "@/src/daa/modules/strategyLab/strategyLabApi";
import type {
  StrategyLabAlignmentMode,
  StrategyLabRunAssetInput,
  StrategyLabRunCandidateView,
  StrategyLabRunResult,
  StrategyLabRunScenarioId,
  StrategyLabRunScenarioView,
} from "@/src/daa/modules/strategyLab/strategyLabContracts";
import type { StrategyLabEnsembleConfig } from "@/src/daa/modules/strategyLab/strategyLabTypes";
import { getStrategyLabSeedReadModel } from "@/src/daa/modules/read/readApi";
import type { StrategyLabSeedReadModel } from "@/src/daa/modules/read/readModels";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

const DEFAULT_ENSEMBLE: StrategyLabEnsembleConfig = {
  momentum: 0.4,
  riskParity: 0.25,
  minVariance: 0.15,
  equalWeight: 0.2,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function clampWeightPct(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function buildResearchTargetWeightPctMap(rows: AssetUniverseView[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const row of rows) {
    next[row.assetKey] = clampWeightPct(Number(row.targetWeightPct) || 0);
  }
  return next;
}

function toUniverseAssetInput(row: AssetUniverseView): StrategyLabRunAssetInput {
  return {
    assetKey: row.assetKey,
    symbol: row.symbol,
    market: row.market,
    currency: row.currency,
    label: `${row.symbol}${row.market ? ` · ${row.market}` : ""}`,
    yfinanceSymbol: row.yfinanceSymbol,
    currentWeightPct: row.actualWeightPct,
    currentTargetWeightPct: row.targetWeightPct,
    holdingQty: row.holdingQty,
    watchEnabled: row.watchEnabled,
  };
}

function normalizeSelectedAssetKeys(rows: AssetUniverseView[], preferred?: string[]): string[] {
  if (preferred && preferred.length > 0) {
    const allow = new Set(rows.map((row) => row.assetKey));
    const kept = preferred.filter((assetKey) => allow.has(assetKey));
    if (kept.length > 0) return kept;
  }
  const seedDefault = rows.filter((row) => row.yfinanceSymbol && (row.watchEnabled || row.holdingQty > 0));
  if (seedDefault.length > 0) return seedDefault.map((row) => row.assetKey);
  return rows.filter((row) => row.yfinanceSymbol).slice(0, 8).map((row) => row.assetKey);
}

function buildStrategyLabRunFingerprint(input: {
  selectedAssets: AssetUniverseView[];
  startDate: string;
  endDate: string;
  benchmarkSymbol: string;
  alignmentMode: StrategyLabAlignmentMode;
  minBars: number;
  lookbackBars: number;
  initialEquity: number;
  slippageBps: number;
  feeRateBps: number;
  ensembleConfig: StrategyLabEnsembleConfig;
  constraints: { maxPositionPct: number; minNotional: number; maxOrderPctOfNav: number };
  policy: { thresholdPct: number; minTradeNotional: number; cooldownSeconds: number };
  baseCurrency: string;
}): string {
  return JSON.stringify({
    assets: input.selectedAssets.map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      currentWeightPct: Number(row.actualWeightPct || 0).toFixed(4),
      targetWeightPct: Number(row.targetWeightPct || 0).toFixed(4),
    })),
    startDate: input.startDate,
    endDate: input.endDate,
    benchmarkSymbol: input.benchmarkSymbol.trim().toUpperCase(),
    alignmentMode: input.alignmentMode,
    minBars: Math.max(0, Number(input.minBars) || 0),
    lookbackBars: Math.max(0, Number(input.lookbackBars) || 0),
    initialEquity: Number(input.initialEquity || 0).toFixed(2),
    slippageBps: Math.max(0, Number(input.slippageBps) || 0),
    feeRateBps: Number(input.feeRateBps || 0).toFixed(2),
    ensembleConfig: input.ensembleConfig,
    constraints: input.constraints,
    policy: input.policy,
    baseCurrency: input.baseCurrency,
  });
}

function estimateCommonTradingBars(input: {
  startDate: string;
  endDate: string;
  selectedAssets: AssetUniverseView[];
}): number {
  const start = Date.parse(`${input.startDate}T00:00:00Z`);
  const end = Date.parse(`${input.endDate}T00:00:00Z`);
  if (!(Number.isFinite(start) && Number.isFinite(end)) || end < start) return 0;

  const allCrypto = input.selectedAssets.length > 0 && input.selectedAssets.every((row) => String(row.market || "").toUpperCase() === "CRYPTO");
  if (allCrypto) {
    return Math.floor((end - start) / 86400000) + 1;
  }

  let weekdays = 0;
  for (let ts = start; ts <= end; ts += 86400000) {
    const day = new Date(ts).getUTCDay();
    if (day !== 0 && day !== 6) weekdays += 1;
  }
  return Math.max(0, Math.floor(weekdays * 0.96));
}

function buildPreflightChecks(input: {
  selectedAssetCount: number;
  selectedTargetSumPct: number;
  startDate: string;
  endDate: string;
  minBars: number;
  lookbackBars: number;
  availableAssets: AssetUniverseView[];
  selectedAssets: AssetUniverseView[];
}) {
  const checks: Array<{ severity: "error" | "warn"; message: string }> = [];
  if (input.selectedAssetCount <= 0) {
    checks.push({ severity: "error", message: "至少选择 1 个研究资产后才能运行。" });
  }
  if (input.startDate > input.endDate) {
    checks.push({ severity: "error", message: "开始日期不能晚于结束日期。" });
  }
  if (input.selectedTargetSumPct <= 0) {
    checks.push({ severity: "error", message: "研究目标权重总和必须大于 0。" });
  }
  if (Math.abs(input.selectedTargetSumPct - 100) > 0.5) {
    checks.push({ severity: "warn", message: `当前研究目标总和为 ${input.selectedTargetSumPct.toFixed(2)}%，建议靠近 100%。` });
  }
  if (input.selectedAssetCount === 1) {
    checks.push({ severity: "warn", message: "当前只有单资产样本，这一轮更像敏感性检查，不适合做策略优选。" });
  }
  if (input.minBars < 120) {
    checks.push({ severity: "warn", message: "最少样本窗口偏短，结果稳定性会下降。" });
  }
  if (input.lookbackBars < 120) {
    checks.push({ severity: "warn", message: "回看窗口偏短，策略风格更容易过拟合。" });
  }
  const estimatedBars = estimateCommonTradingBars({
    startDate: input.startDate,
    endDate: input.endDate,
    selectedAssets: input.selectedAssets,
  });
  if (estimatedBars > 0 && estimatedBars < input.minBars) {
    checks.push({
      severity: "warn",
      message: `按当前区间估算，可对齐样本约 ${estimatedBars} 个交易日，已经低于最少样本 ${input.minBars}；建议拉长区间或下调最少样本。`,
    });
  } else if (estimatedBars > 0 && estimatedBars <= input.lookbackBars + 5) {
    checks.push({
      severity: "warn",
      message: `按当前区间估算，可对齐样本约 ${estimatedBars} 个交易日，几乎贴着回看窗口 ${input.lookbackBars}；结果稳定性会偏弱。`,
    });
  }
  if (input.availableAssets.length <= 1) {
    checks.push({ severity: "warn", message: "当前可研究资产池偏小，结果的横向可比性有限。" });
  }
  return checks;
}

function buildResultReadiness(input: {
  result: StrategyLabRunResult | null;
  selectedScenario: StrategyLabRunScenarioView | null;
  selectedCandidate: StrategyLabRunCandidateView | null;
  warningSummary: string[];
}) {
  if (!input.result || !input.selectedCandidate) return null;

  let tone: "green" | "amber" | "red" = "green";
  const items: string[] = [];
  const summary = input.selectedCandidate.backtest.summary;

  if (input.result.assetsUsed.length <= 1) {
    tone = "red";
    items.push("本轮仍是单资产样本，适合看执行边界，不适合做组合优选。");
  }
  if ((summary.turnoverNotional || 0) <= 0) {
    tone = "red";
    items.push("样本期没有发生有效成交，当前结果接近静态持有。\n");
  } else if ((summary.rebalanceCount || 0) <= 1) {
    if (tone !== "red") tone = "amber";
    items.push("再平衡事件较少，建议拉长区间或扩展资产池再做比较。");
  }
  if (input.warningSummary.length > 0) {
    if (tone === "green") tone = "amber";
    items.push("当前结果含有执行或数据边界提示，写回前建议先看可执行场景。\n");
  }
  if (items.length <= 0) {
    items.push("这轮结果的样本覆盖和可执行性都较完整，可以作为候选比较的有效输入。\n");
  }

  return {
    tone,
    title: tone === "green" ? "结果可信度较高" : tone === "amber" ? "结果需要结合边界解读" : "结果可信度偏低",
    description: "先判断这轮结果是否可比较、可执行、可解释，再决定是否写回工作台。",
    items: items.map((item) => item.trim()).filter(Boolean),
  };
}

function describeExecutionGap(value: number) {
  const numeric = Number(value) || 0;
  if (numeric >= 0.05) return { tone: "red" as const, label: "执行损耗较明显", displayValue: `${(numeric * 100).toFixed(2)}%` };
  if (numeric > 0) return { tone: "amber" as const, label: "存在可见执行损耗", displayValue: `${(numeric * 100).toFixed(2)}%` };
  return { tone: "green" as const, label: "执行差异可控", displayValue: `${(numeric * 100).toFixed(2)}%` };
}

function describeRankShift(value: number | null) {
  if (value == null || value === 0) return { tone: "slate" as const, label: "排名不变", displayValue: "0" };
  if (value > 0) return { tone: "amber" as const, label: "切到另一场景后排名下滑", displayValue: `+${value}` };
  return { tone: "green" as const, label: "切到另一场景后排名提升", displayValue: String(value) };
}

function normalizeWarningAssetLabel(symbolRaw: string): string {
  const symbol = String(symbolRaw || "").trim();
  if (!symbol) return "未知资产";
  const parts = symbol.split("::");
  return parts[parts.length - 1] || symbol;
}

function normalizeMinOrderReasonLabel(reasonRaw: string): string {
  const reason = String(reasonRaw || "").trim().toLowerCase();
  if (reason === "capped-below-min") return "受成交上限约束后仍低于最小成交额";
  if (reason === "rounded-below-min") return "取整后仍低于最小成交额";
  return "最小成交额或取整余量不足";
}

function buildWarningSummary(warnings: string[]): string[] {
  const seen = new Set<string>();
  const summary: string[] = [];
  const minOrderGroups = new Map<string, { asset: string; reason: string; buy: number; sell: number }>();
  let hiddenMinOrderCount = 0;

  for (const raw of warnings) {
    const warning = String(raw || "").trim();
    if (!warning || seen.has(warning)) continue;
    seen.add(warning);

    const roundedMatch = warning.match(/^warning:\s*min order size:\s*(BUY|SELL)\s+([^\s;]+)\s+rounded\s+/i);
    if (roundedMatch) {
      const side = roundedMatch[1].toUpperCase();
      const asset = normalizeWarningAssetLabel(roundedMatch[2]);
      const reason = "最小成交额或取整余量不足";
      const key = `${asset}|${reason}`;
      const current = minOrderGroups.get(key) || { asset, reason, buy: 0, sell: 0 };
      if (side === "BUY") current.buy += 1;
      else current.sell += 1;
      minOrderGroups.set(key, current);
      continue;
    }

    const suppressedMatch = warning.match(/^warning:\s*min order size:\s*suppressed\s+(BUY|SELL)\s+([^;]+);.*?reason=([^\);]+)\)?/i);
    if (suppressedMatch) {
      const side = suppressedMatch[1].toUpperCase();
      const asset = normalizeWarningAssetLabel(suppressedMatch[2]);
      const reason = normalizeMinOrderReasonLabel(suppressedMatch[3]);
      const key = `${asset}|${reason}`;
      const current = minOrderGroups.get(key) || { asset, reason, buy: 0, sell: 0 };
      if (side === "BUY") current.buy += 1;
      else current.sell += 1;
      minOrderGroups.set(key, current);
      continue;
    }

    const omittedMatch = warning.match(/^warning:\s*min order size:\s*(\d+)\s+more\s+(?:rounded remainder\(s\)|suppressed candidate\(s\))\s+omitted$/i);
    if (omittedMatch) {
      hiddenMinOrderCount += Number(omittedMatch[1]) || 0;
      continue;
    }

    summary.push(warning);
  }

  for (const group of [...minOrderGroups.values()].sort((left, right) => left.asset.localeCompare(right.asset) || left.reason.localeCompare(right.reason))) {
    const sideParts: string[] = [];
    if (group.buy > 0) sideParts.push(`买入 ${group.buy} 次`);
    if (group.sell > 0) sideParts.push(`卖出 ${group.sell} 次`);
    summary.push(`${group.asset}：${sideParts.join("，")}因“${group.reason}”被压缩或跳过。`);
  }

  if (hiddenMinOrderCount > 0) {
    summary.push(`另有 ${hiddenMinOrderCount} 条最小成交额相关明细已折叠，当前只展示归纳后的重点影响。`);
  }

  return summary;
}

export function useStrategyLabModel() {
  const [seed, setSeed] = useState<StrategyLabSeedReadModel | null>(null);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [selectedAssetKeys, setSelectedAssetKeys] = useState<string[]>([]);
  const [researchTargetWeightPctByAssetKey, setResearchTargetWeightPctByAssetKey] = useState<Record<string, number>>({});
  const [startDate, setStartDate] = useState(daysAgoIso(730));
  const [endDate, setEndDate] = useState(todayIso());
  const [benchmarkSymbol, setBenchmarkSymbol] = useState("SPY");
  const [alignmentMode, setAlignmentMode] = useState<StrategyLabAlignmentMode>("intersection");
  const [minBars, setMinBars] = useState(252);
  const [lookbackBars, setLookbackBars] = useState(252);
  const [initialEquity, setInitialEquity] = useState(100000);
  const [slippageBps, setSlippageBps] = useState(0);
  const [feeRateBps, setFeeRateBps] = useState(5);
  const [ensembleConfig, setEnsembleConfig] = useState<StrategyLabEnsembleConfig>(DEFAULT_ENSEMBLE);
  const [constraints, setConstraints] = useState({ maxPositionPct: 0.3, minNotional: 200, maxOrderPctOfNav: 0.1 });
  const [policy, setPolicy] = useState({ thresholdPct: 0.05, minTradeNotional: 200, cooldownSeconds: 72 * 3600 });
  const [systemDefaults, setSystemDefaults] = useState<{
    constraints: { maxPositionPct: number; minNotional: number; maxOrderPctOfNav: number };
    policy: { thresholdPct: number; minTradeNotional: number; cooldownSeconds: number };
    execution: { feeRateBps: number; slippageBps: number };
  } | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [refreshingContext, setRefreshingContext] = useState(false);
  const [contextError, setContextError] = useState("");
  const [running, setRunning] = useState(false);
  const [writingBack, setWritingBack] = useState(false);
  const [result, setResult] = useState<StrategyLabRunResult | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<StrategyLabRunScenarioId>("executable");
  const [selectedCandidateId, setSelectedCandidateId] = useState<StrategyLabRunCandidateView["id"] | null>(null);
  const [lastRunFingerprint, setLastRunFingerprint] = useState<string | null>(null);
  const [showResearchFrame, setShowResearchFrame] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(true);
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  const [showEquityChart, setShowEquityChart] = useState(true);
  const hasHydratedDefaultsRef = useRef(false);

  const applySeedDefaults = useCallback((nextSeed: StrategyLabSeedReadModel) => {
    setBaseCurrency(nextSeed.baseCurrency || "USD");
    setInitialEquity(Math.max(1000, Number(nextSeed.initialEquity) || 100000));
    setConstraints({ ...nextSeed.constraints });
    setPolicy({ ...nextSeed.policy });
    setFeeRateBps(Number(nextSeed.execution.feeRateBps) || 0);
    setSlippageBps(Number(nextSeed.execution.slippageBps) || 0);
    setSystemDefaults({
      constraints: { ...nextSeed.constraints },
      policy: { ...nextSeed.policy },
      execution: {
        feeRateBps: Number(nextSeed.execution.feeRateBps) || 0,
        slippageBps: Number(nextSeed.execution.slippageBps) || 0,
      },
    });
    hasHydratedDefaultsRef.current = true;
    setSelectedAssetKeys((prev) => normalizeSelectedAssetKeys(nextSeed.availableAssets || [], prev.length > 0 ? prev : nextSeed.selectedAssetKeys));
    setResearchTargetWeightPctByAssetKey((prev) => {
      const base = buildResearchTargetWeightPctMap(nextSeed.availableAssets || []);
      return Object.keys(prev).length > 0 ? { ...base, ...prev } : base;
    });
  }, []);

  const reloadSeed = useCallback(async (silent = false, preserveForm = true) => {
    if (silent) setRefreshingContext(true);
    else setLoadingContext(true);
    setContextError("");
    try {
      const nextSeed = await getStrategyLabSeedReadModel();
      setSeed(nextSeed);
      if (!preserveForm || !hasHydratedDefaultsRef.current) {
        applySeedDefaults(nextSeed);
      } else {
        setSelectedAssetKeys((prev) => normalizeSelectedAssetKeys(nextSeed.availableAssets || [], prev));
        setResearchTargetWeightPctByAssetKey((prev) => {
          const base = buildResearchTargetWeightPctMap(nextSeed.availableAssets || []);
          return { ...base, ...prev };
        });
      }
    } catch (error) {
      const message = getApiErrorMessage(error);
      setContextError(message);
      toast.error(message);
    } finally {
      if (silent) setRefreshingContext(false);
      else setLoadingContext(false);
    }
  }, [applySeedDefaults]);

  useEffect(() => {
    void reloadSeed(false, false);
  }, [reloadSeed]);

  const bootstrap = seed?.bootstrap || null;
  const availableAssets = useMemo(() => seed?.availableAssets || [], [seed]);

  const sourceSelectedAssets = useMemo(
    () => availableAssets.filter((row) => selectedAssetKeys.includes(row.assetKey)),
    [availableAssets, selectedAssetKeys],
  );

  const selectedAssets = useMemo(() => {
    return sourceSelectedAssets.map((row) => ({
      ...row,
      targetWeightPct: clampWeightPct(researchTargetWeightPctByAssetKey[row.assetKey] ?? row.targetWeightPct ?? 0),
      targetWeightHint: clampWeightPct(researchTargetWeightPctByAssetKey[row.assetKey] ?? row.targetWeightHint ?? 0),
    }));
  }, [researchTargetWeightPctByAssetKey, sourceSelectedAssets]);

  const selectedAssetCount = selectedAssets.length;
  const selectedHoldingCount = selectedAssets.filter((row) => row.holdingQty > 0).length;
  const selectedTargetSumPct = selectedAssets.reduce((sum, row) => sum + Math.max(0, Number(row.targetWeightPct || 0)), 0);
  const workbenchSelectedTargetSumPct = sourceSelectedAssets.reduce((sum, row) => sum + Math.max(0, Number(row.targetWeightPct || 0)), 0);

  const researchTargetOverrideActive = useMemo(
    () => sourceSelectedAssets.some((row) => Math.abs((researchTargetWeightPctByAssetKey[row.assetKey] ?? row.targetWeightPct ?? 0) - (row.targetWeightPct ?? 0)) > 1e-8),
    [researchTargetWeightPctByAssetKey, sourceSelectedAssets],
  );

  const targetComparisonRows = useMemo(() => availableAssets.map((row) => ({
    ...row,
    selected: selectedAssetKeys.includes(row.assetKey),
    researchTargetWeightPct: clampWeightPct(researchTargetWeightPctByAssetKey[row.assetKey] ?? row.targetWeightPct ?? 0),
  })), [availableAssets, researchTargetWeightPctByAssetKey, selectedAssetKeys]);

  const changedResearchTargetCount = useMemo(
    () => sourceSelectedAssets.filter((row) => Math.abs((researchTargetWeightPctByAssetKey[row.assetKey] ?? row.targetWeightPct ?? 0) - (row.targetWeightPct ?? 0)) > 1e-8).length,
    [researchTargetWeightPctByAssetKey, sourceSelectedAssets],
  );

  const ensembleInputSum = useMemo(
    () => Object.values(ensembleConfig).reduce((sum, item) => sum + Math.max(0, Number(item) || 0), 0),
    [ensembleConfig],
  );

  const normalizedEnsembleRows = useMemo(() => {
    const total = ensembleInputSum > 0 ? ensembleInputSum : 1;
    return Object.entries(ensembleConfig).map(([key, rawValue]) => ({ key, rawValue, normalizedValue: Math.max(0, Number(rawValue) || 0) / total }));
  }, [ensembleConfig, ensembleInputSum]);

  const currentRunFingerprint = useMemo(() => buildStrategyLabRunFingerprint({
    selectedAssets,
    startDate,
    endDate,
    benchmarkSymbol,
    alignmentMode,
    minBars,
    lookbackBars,
    initialEquity,
    slippageBps,
    feeRateBps,
    ensembleConfig,
    constraints,
    policy,
    baseCurrency,
  }), [alignmentMode, baseCurrency, benchmarkSymbol, constraints, endDate, ensembleConfig, feeRateBps, initialEquity, lookbackBars, minBars, policy, selectedAssets, slippageBps, startDate]);

  const scenarioMap = useMemo(() => new Map((result?.scenarios || []).map((item) => [item.scenarioId, item])), [result]);
  const selectedScenario = (scenarioMap.get(selectedScenarioId) || result?.scenarios?.[0] || null) as StrategyLabRunScenarioView | null;
  const selectedCandidate = useMemo(() => {
    if (!selectedScenario) return null;
    return selectedScenario.candidates.find((item) => item.id === selectedCandidateId) || selectedScenario.candidates[0] || null;
  }, [selectedCandidateId, selectedScenario]);

  useEffect(() => {
    if (!selectedScenario) {
      setSelectedCandidateId(null);
      return;
    }
    if (selectedCandidateId && selectedScenario.candidates.some((item) => item.id === selectedCandidateId)) return;
    setSelectedCandidateId(selectedScenario.bestCandidateId || selectedScenario.candidates[0]?.id || null);
  }, [selectedCandidateId, selectedScenario]);

  const warningSummary = useMemo(() => buildWarningSummary([
    ...(result?.warnings || []),
    ...(selectedScenario?.warnings || []),
    ...(selectedCandidate?.warnings || []),
    ...(selectedCandidate?.backtest.warnings || []),
  ]), [result, selectedCandidate, selectedScenario]);

  const selectedDiffRows = useMemo(
    () => selectedCandidate ? buildTargetWeightDiffRows(result?.currentTargetWeights || {}, selectedCandidate.targetWeights || {}) : [],
    [result, selectedCandidate],
  );

  const assetLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of availableAssets) map.set(row.assetKey, row.symbol);
    for (const row of result?.assetsUsed || []) map.set(row.assetKey, row.symbol);
    return map;
  }, [availableAssets, result]);

  const topContributors = useMemo(() => {
    return selectedCandidate?.attribution.perAsset?.slice(0, 6) || [];
  }, [selectedCandidate]);

  const preflightChecks = useMemo(() => buildPreflightChecks({
    selectedAssetCount,
    selectedTargetSumPct,
    startDate,
    endDate,
    minBars,
    lookbackBars,
    availableAssets,
    selectedAssets,
  }), [availableAssets, endDate, lookbackBars, minBars, selectedAssetCount, selectedAssets, selectedTargetSumPct, startDate]);
  const blockingPreflightChecks = useMemo(() => preflightChecks.filter((item) => item.severity === "error"), [preflightChecks]);
  const advisoryPreflightChecks = useMemo(() => preflightChecks.filter((item) => item.severity === "warn"), [preflightChecks]);

  const resultReadiness = useMemo(() => buildResultReadiness({
    result,
    selectedScenario,
    selectedCandidate,
    warningSummary,
  }), [result, selectedCandidate, selectedScenario, warningSummary]);

  const selectedCandidateScenarioComparison = useMemo(() => {
    if (!result || !selectedCandidate) return null;
    const comparison = result.candidateComparisons.find((item) => item.candidateId === selectedCandidate.id) || null;
    if (!comparison) return null;
    return {
      ...comparison,
      currentRank: selectedScenarioId === "executable" ? comparison.executableRank : comparison.idealRank,
      otherRank: selectedScenarioId === "executable" ? comparison.idealRank : comparison.executableRank,
      rankShift: selectedScenarioId === "executable"
        ? (comparison.idealRank != null && comparison.executableRank != null ? comparison.idealRank - comparison.executableRank : null)
        : (comparison.executableRank != null && comparison.idealRank != null ? comparison.executableRank - comparison.idealRank : null),
    };
  }, [result, selectedCandidate, selectedScenarioId]);

  const executionGapMeta = useMemo(
    () => selectedCandidateScenarioComparison ? describeExecutionGap(selectedCandidateScenarioComparison.executionGap) : null,
    [selectedCandidateScenarioComparison],
  );
  const selectedCandidateRankMeta = useMemo(
    () => selectedCandidateScenarioComparison ? describeRankShift(selectedCandidateScenarioComparison.rankShift) : null,
    [selectedCandidateScenarioComparison],
  );

  const usingSystemExecutionDefaults = useMemo(() => {
    if (!systemDefaults) return true;
    return Math.abs(systemDefaults.constraints.maxPositionPct - constraints.maxPositionPct) <= 1e-8
      && Math.abs(systemDefaults.constraints.minNotional - constraints.minNotional) <= 1e-8
      && Math.abs(systemDefaults.constraints.maxOrderPctOfNav - constraints.maxOrderPctOfNav) <= 1e-8
      && Math.abs(systemDefaults.policy.thresholdPct - policy.thresholdPct) <= 1e-8
      && Math.abs(systemDefaults.policy.minTradeNotional - policy.minTradeNotional) <= 1e-8
      && Math.abs(systemDefaults.policy.cooldownSeconds - policy.cooldownSeconds) <= 1e-8
      && Math.abs(systemDefaults.execution.feeRateBps - feeRateBps) <= 1e-8
      && Math.abs(systemDefaults.execution.slippageBps - slippageBps) <= 1e-8;
  }, [constraints, feeRateBps, policy, slippageBps, systemDefaults]);

  const resultIsStale = Boolean(result) && lastRunFingerprint !== null && lastRunFingerprint !== currentRunFingerprint;
  const canRun = selectedAssetCount >= 1 && blockingPreflightChecks.length <= 0 && !running && !loadingContext;
  const canWriteback = Boolean(result && selectedCandidate && !resultIsStale && !writingBack && Object.keys(selectedCandidate?.targetWeights || {}).length > 0);

  const handleRun = useCallback(async () => {
    if (!canRun) return;
    if (blockingPreflightChecks.length > 0) {
      toast.error(blockingPreflightChecks[0]?.message || "当前实验设置不满足运行条件");
      return;
    }
    if (advisoryPreflightChecks.length > 0) {
      toast.warning(advisoryPreflightChecks[0]?.message || "当前结果会受到实验边界影响");
    }
    const requestFingerprint = currentRunFingerprint;
    setRunning(true);
    try {
      const next = await runStrategyLabApi({
        assets: selectedAssets.map(toUniverseAssetInput),
        startDate,
        endDate,
        benchmarkSymbol,
        alignmentMode,
        minBars,
        lookbackBars,
        baseCurrency,
        ensembleConfig,
        initialEquity,
        constraints,
        policy,
        execution: {
          timing: "t_plus_1_close",
          feeRateBps,
          slippageBps,
        },
      });
      setResult(next);
      setSelectedScenarioId(next.defaultScenarioId || "executable");
      const defaultScenario = next.scenarios.find((item) => item.scenarioId === (next.defaultScenarioId || "executable")) || next.scenarios[0] || null;
      setSelectedCandidateId(defaultScenario?.bestCandidateId || defaultScenario?.candidates[0]?.id || next.bestCandidateId || next.candidates[0]?.id || null);
      setLastRunFingerprint(requestFingerprint);
      setShowDeepAnalysis(false);
      setShowEquityChart(true);
      toast.success(`策略实验室运行完成，生成 ${next.candidates.length} 组候选。`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setRunning(false);
    }
  }, [advisoryPreflightChecks, alignmentMode, baseCurrency, benchmarkSymbol, blockingPreflightChecks, canRun, constraints, currentRunFingerprint, endDate, ensembleConfig, feeRateBps, initialEquity, lookbackBars, minBars, policy, selectedAssets, slippageBps, startDate]);

  const handleWriteback = useCallback(async () => {
    if (!result || !selectedCandidate || writingBack) return;
    if (resultIsStale) {
      toast.error("当前结果已经不是这套实验配置的最新输出，请重新运行后再写回工作台。");
      return;
    }
    if (Object.keys(selectedCandidate.targetWeights || {}).length <= 0) {
      toast.error("当前候选没有可写回的目标权重。");
      return;
    }
    setWritingBack(true);
    try {
      const writeback = await writeStrategyLabTargetWeightsApi({
        candidateId: selectedCandidate.id,
        scopeAssetKeys: result.assetsUsed.map((item) => item.assetKey),
        weightsByAssetKey: selectedCandidate.targetWeights,
      });
      setResult((prev) => prev ? { ...prev, currentTargetWeights: { ...selectedCandidate.targetWeights } } : prev);
      setResearchTargetWeightPctByAssetKey((prev) => {
        const next = { ...prev };
        for (const asset of result.assetsUsed) {
          next[asset.assetKey] = clampWeightPct(Number(selectedCandidate.targetWeights[asset.assetKey] || 0) * 100);
        }
        return next;
      });
      if (writeback.updatedCount <= 0 && !writeback.clearedConfigTargetWeights) {
        toast.message("当前目标已与该候选一致，无需写回。");
      } else {
        toast.success(`已将 ${selectedCandidate.label} 写回为当前目标。`);
      }
      await reloadSeed(true, true);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setWritingBack(false);
    }
  }, [reloadSeed, result, resultIsStale, selectedCandidate, writingBack]);

  const resetAdvancedExecutionSettings = useCallback(() => {
    if (!systemDefaults) return;
    setConstraints(systemDefaults.constraints);
    setPolicy(systemDefaults.policy);
    setFeeRateBps(systemDefaults.execution.feeRateBps);
    setSlippageBps(systemDefaults.execution.slippageBps);
  }, [systemDefaults]);

  const toggleAsset = useCallback((assetKey: string) => {
    setSelectedAssetKeys((prev) => {
      const next = new Set(prev);
      if (next.has(assetKey)) next.delete(assetKey);
      else next.add(assetKey);
      return [...next];
    });
  }, []);

  const setResearchTargetWeightPct = useCallback((assetKey: string, nextValue: number) => {
    setResearchTargetWeightPctByAssetKey((prev) => ({
      ...prev,
      [assetKey]: clampWeightPct(nextValue),
    }));
  }, []);

  const resetResearchTargetWeights = useCallback(() => {
    setResearchTargetWeightPctByAssetKey(buildResearchTargetWeightPctMap(availableAssets));
    toast.success("已恢复为工作台目标权重。");
  }, [availableAssets]);

  const applyEqualResearchTargetWeights = useCallback(() => {
    if (!selectedAssets.length) return;
    const each = Number((100 / selectedAssets.length).toFixed(4));
    setResearchTargetWeightPctByAssetKey((prev) => {
      const next = { ...prev };
      for (const row of selectedAssets) next[row.assetKey] = each;
      return next;
    });
    toast.success("已按选中资产平均分配研究目标权重。");
  }, [selectedAssets]);

  return {
    seed,
    bootstrap,
    availableAssets,
    targetComparisonRows,
    baseCurrency,
    setBaseCurrency,
    selectedAssetKeys,
    setSelectedAssetKeys,
    selectedAssets,
    selectedAssetCount,
    selectedHoldingCount,
    selectedTargetSumPct,
    workbenchSelectedTargetSumPct,
    researchTargetWeightPctByAssetKey,
    researchTargetOverrideActive,
    changedResearchTargetCount,
    setResearchTargetWeightPctByAssetKey,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    benchmarkSymbol,
    setBenchmarkSymbol,
    alignmentMode,
    setAlignmentMode,
    minBars,
    setMinBars,
    lookbackBars,
    setLookbackBars,
    initialEquity,
    setInitialEquity,
    slippageBps,
    setSlippageBps,
    feeRateBps,
    setFeeRateBps,
    ensembleConfig,
    setEnsembleConfig,
    normalizedEnsembleRows,
    ensembleInputSum,
    constraints,
    setConstraints,
    policy,
    setPolicy,
    systemDefaults,
    loadingContext,
    refreshingContext,
    contextError,
    running,
    writingBack,
    result,
    selectedScenarioId,
    setSelectedScenarioId,
    selectedScenario,
    selectedCandidateId,
    setSelectedCandidateId,
    selectedCandidate,
    lastRunFingerprint,
    currentRunFingerprint,
    resultIsStale,
    warningSummary,
    preflightChecks,
    blockingPreflightChecks,
    advisoryPreflightChecks,
    resultReadiness,
    selectedDiffRows,
    selectedCandidateScenarioComparison,
    executionGapMeta,
    selectedCandidateRankMeta,
    assetLabelByKey,
    topContributors,
    usingSystemExecutionDefaults,
    canRun,
    canWriteback,
    showResearchFrame,
    setShowResearchFrame,
    showAdvancedSettings,
    setShowAdvancedSettings,
    showAssetPicker,
    setShowAssetPicker,
    showDeepAnalysis,
    setShowDeepAnalysis,
    showEquityChart,
    setShowEquityChart,
    reloadSeed,
    handleRun,
    handleWriteback,
    resetAdvancedExecutionSettings,
    toggleAsset,
    setResearchTargetWeightPct,
    resetResearchTargetWeights,
    applyEqualResearchTargetWeights,
  };
}

export type StrategyLabModel = ReturnType<typeof useStrategyLabModel>;
