import { normalizeDaaCurrencyCodeV1, normalizeDaaSymbolV1, parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import type { DaaMarketContextV1, DaaMarketRegimeV1 } from "@/src/daa/modules/marketContext/marketContextTypesV1";
import { getStrategyExecutionConfigV2 } from "@/src/daa/config/systemConfigV2";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { runLlmDecisionV2 } from "@/src/daa/llm/llmDecisionV2";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";
import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import type { UnifiedDecisionResultV2 } from "@/src/daa/modules/decision/decisionResultTypesV2";
import {
  buildMarketContextAttributionV1,
  getCurrentMarketContextV1,
  marketRegimeLabelZhV1,
} from "@/src/daa/modules/marketContext/marketIndicatorServiceV1";
import { classifyCashV2 } from "./cashClassificationV2";
import { fuseDecisionV2 } from "./decisionFusionV2";
import {
  appendDaaTriggerEventV1,
  appendDaaRunHistoryV1,
  appendAssetPriceHistoryRowsV1,
  createDaaRebalanceCycleV1,
  createDaaRebalanceDecisionV1,
  createDaaTradeTicketV1,
  executeDaaTradeTicketsV1,
  getDaaCycleReportV1,
  getDaaHumanIngestStateV1,
  getDaaRebalanceCycleV1,
  getDaaSystemConfigV2,
  getDaaMarketCacheHealthStatsV1,
  listDaaAssetUniverseV1,
  listDaaCycleReportsV1,
  listDaaEquitySnapshotsV1,
  listDaaFxRatesV1,
  listDaaRebalanceCyclesV1,
  listDaaTradeTicketsV1,
  patchDaaRebalanceCycleV1,
  upsertDaaCycleReportV1,
  updateDaaAssetUniverseLastPriceV1,
  type DaaStoreRebalanceCycleV1,
} from "@/src/daa/store/daaStorePgV1";
import { buildDaaUnifiedPlanV1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";
import {
  buildFxLookupToBaseV1,
  summarizeMarkToMarketPortfolioV1,
} from "@/src/daa/modules/portfolio/portfolioValuationV1";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";

import { buildAssetUniverseViewRowsV1 } from "./assetUniverseServiceV1";
import type {
  ExecuteRebalanceSummaryV1,
  ExecuteRebalanceCycleResultV1,
  GenerateRebalanceCycleInputV1,
  GenerateRebalanceCycleResultV1,
  HfSignalSummaryV1,
  PortfolioHealthyInsightV1,
  PreTradeRiskCheckItemV1,
  PreTradeRiskCheckV1,
  RebalanceCycleV1,
  RebalanceProposalV1,
  RebalanceTriggerSourceV1,
  UpdateRebalanceCycleInputV1,
  WorkbenchBootstrapV1,
  WorkbenchRebalanceCycleReportV1,
  WorkbenchRecommendationV1,
  WorkbenchRecommendationsResultV1,
  WorkbenchTradeRecordsV1,
} from "./workbenchTypesV1";

const PRICE_SYNC_TIMEOUT_MS = 2600;
const PRICE_SYNC_CONCURRENCY = 4;
const PRICE_SYNC_MAX_TARGETS = 30;
const PRICE_STALE_SEC = 6 * 60 * 60;
const PRICE_REFRESH_FRESH_SKIP_SEC = 120;

export type WorkbenchDomainErrorCodeV1 =
  | "CYCLE_NOT_EXECUTABLE"
  | "CYCLE_IMMUTABLE"
  | "CYCLE_ALREADY_COMPLETED";

export class WorkbenchDomainErrorV1 extends Error {
  readonly code: WorkbenchDomainErrorCodeV1;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: WorkbenchDomainErrorCodeV1,
    message: string,
    options: {
      status?: number;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "WorkbenchDomainErrorV1";
    this.code = code;
    this.status = options.status ?? 409;
    this.details = options.details ?? {};
  }
}

function toFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositive(value: unknown, fallback = 0): number {
  return Math.max(0, toFinite(value, fallback));
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function pickArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function actionLabelZhV1(action: string): string {
  if (action === "open_or_add") return "开仓/加仓";
  if (action === "reduce_or_avoid") return "减仓/回避";
  return "观察";
}

function reasonZhV1(reasons: string[]): string {
  const rows = (Array.isArray(reasons) ? reasons : []).map((item) => normalizeText(item)).filter(Boolean).slice(0, 4);
  return rows.length ? rows.join("；") : "暂无显著驱动因子";
}

function riskZhV1(riskScorePct: number, reasons: string[]): string {
  const riskReasons = (Array.isArray(reasons) ? reasons : []).filter((item) => /risk|风险|回撤|波动|drawdown|reduce|avoid/i.test(item));
  if (riskScorePct >= 75) {
    return riskReasons.length ? `风险偏高：${riskReasons.slice(0, 2).join("；")}` : "风险评分偏高，建议控制仓位";
  }
  if (riskScorePct >= 60) {
    return riskReasons.length ? `风险中等：${riskReasons.slice(0, 2).join("；")}` : "风险中等，建议分批执行";
  }
  return "风险可控，注意仓位管理";
}

function toPct(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function toIsoByMs(ms: number): string {
  return new Date(ms).toISOString();
}

function normalizeTimeZoneOrUtcV1(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: text }).format(new Date());
    return text;
  } catch {
    return "UTC";
  }
}

function toUtcMinuteOfDayV1(value: string): number | null {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalizeText(value));
  if (!matched) return null;
  return Number(matched[1]) * 60 + Number(matched[2]);
}

function isPastUtcTimeV1(now: Date, hhmm: string): boolean {
  const minute = toUtcMinuteOfDayV1(hhmm);
  if (minute == null) return true;
  const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return nowMinute >= minute;
}

function getZonedYmdV1(date: Date, timeZone: string): { year: number; month: number; day: number } {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((item) => item.type === "year")?.value || "");
    const month = Number(parts.find((item) => item.type === "month")?.value || "");
    const day = Number(parts.find((item) => item.type === "day")?.value || "");
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return { year, month, day };
    }
  } catch {
    // ignored
  }
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function isCalendarMonthDueV1(
  month: number,
  frequency: "monthly" | "quarterly" | "semi_annual" | "annual",
): boolean {
  if (frequency === "monthly") return true;
  if (frequency === "quarterly") return month === 1 || month === 4 || month === 7 || month === 10;
  if (frequency === "semi_annual") return month === 1 || month === 7;
  return month === 1;
}

function buildCalendarPeriodKeyV1(input: {
  date: Date;
  timeZone: string;
  frequency: "monthly" | "quarterly" | "semi_annual" | "annual";
}): string {
  const { year, month } = getZonedYmdV1(input.date, input.timeZone);
  if (input.frequency === "annual") return `${year}`;
  if (input.frequency === "semi_annual") return `${year}-H${month <= 6 ? 1 : 2}`;
  if (input.frequency === "quarterly") return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function nextCalendarDueDateV1(input: {
  frequency: "monthly" | "quarterly" | "semi_annual" | "annual";
  dayOfMonth: number;
  nowMs?: number;
}): string {
  const now = new Date(input.nowMs ?? Date.now());
  const stepMonths = input.frequency === "quarterly"
    ? 3
    : (input.frequency === "semi_annual" ? 6 : (input.frequency === "annual" ? 12 : 1));
  const day = Math.max(1, Math.min(28, Math.trunc(input.dayOfMonth || 1)));

  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let candidate = Date.UTC(year, month, day, 0, 0, 0, 0);
  while (candidate <= now.getTime()) {
    month += stepMonths;
    while (month > 11) {
      month -= 12;
      year += 1;
    }
    candidate = Date.UTC(year, month, day, 0, 0, 0, 0);
  }
  return toIsoByMs(candidate);
}

function buildHfSignalSummaryV1(input: {
  symbol: string;
  scorePct: number;
  convictionPct: number;
  thesisDriftPct: number;
  fundDetails: HfSignalSummaryV1["funds"];
}): HfSignalSummaryV1 {
  const score = toPct(input.scorePct);
  const conviction = toPct(input.convictionPct);
  const thesisDrift = toPct(input.thesisDriftPct);

  let level: HfSignalSummaryV1["level"] = "none";
  let icon: HfSignalSummaryV1["icon"] = "⚪";
  let label = "无信号";
  if (score > 0 || conviction > 0 || thesisDrift > 0) {
    if (score > 60 && conviction > 50) {
      level = "bullish";
      icon = "🟢";
      label = "看多共识";
    } else if (score < 40 || thesisDrift > 12) {
      level = "bearish";
      icon = "🔴";
      label = "看空/减持";
    } else {
      level = "neutral";
      icon = "🟡";
      label = "信号中性";
    }
  }

  const netChange = input.fundDetails.reduce((sum, row) => sum + row.changePct, 0);
  const trend: HfSignalSummaryV1["trend"] = level === "none"
    ? "none"
    : (netChange > 0.1 ? "adding" : (netChange < -0.1 ? "trimming" : "neutral"));

  return {
    level,
    icon,
    label,
    aggregatedScorePct: score,
    convictionPct: conviction,
    thesisDriftPct: thesisDrift,
    fundCount: input.fundDetails.length,
    trend,
    funds: input.fundDetails,
  };
}

async function buildHfSignalMapV1(): Promise<Map<string, HfSignalSummaryV1>> {
  const state = await getDaaHumanIngestStateV1();
  const map = new Map<string, HfSignalSummaryV1>();
  if (!state?.latestBatch) return map;

  const latestBatch = state.latestBatch && typeof state.latestBatch === "object"
    ? state.latestBatch as Record<string, unknown>
    : {};
  const signals = Array.isArray(latestBatch.signals) ? latestBatch.signals : [];

  const holdingsBySymbol = new Map<string, HfSignalSummaryV1["funds"]>();
  for (const rowRaw of Array.isArray(state.latestHoldings) ? state.latestHoldings : []) {
    const row = rowRaw && typeof rowRaw === "object" ? rowRaw as Record<string, unknown> : {};
    const symbol = normalizeText(row.symbol).toUpperCase();
    if (!symbol) continue;
    const list = holdingsBySymbol.get(symbol) || [];
    list.push({
      fundCode: normalizeText(row.fundCode || row.actorId || ""),
      fundName: normalizeText(row.fundName || row.actorName || ""),
      weightPct: toPct(row.weightPct || row.weight || 0),
      changePct: toPct(row.changePct || row.weightDeltaPct || 0),
    });
    holdingsBySymbol.set(symbol, list);
  }

  for (const itemRaw of signals) {
    const item = itemRaw && typeof itemRaw === "object" ? itemRaw as Record<string, unknown> : {};
    const symbol = normalizeText(item.symbol).toUpperCase();
    if (!symbol) continue;
    const funds = (holdingsBySymbol.get(symbol) || [])
      .filter((row) => row.fundCode || row.fundName)
      .slice(0, 6);
    map.set(
      symbol,
      buildHfSignalSummaryV1({
        symbol,
        scorePct: Number(item.aggregatedScorePct || 0),
        convictionPct: Number(item.convictionPct || 0),
        thesisDriftPct: Number(item.thesisDriftPct || 0),
        fundDetails: funds,
      }),
    );
  }

  return map;
}

function computeHhiPctV1(weightsPct: number[]): number {
  if (!weightsPct.length) return 0;
  return weightsPct.reduce((sum, weight) => sum + ((weight / 100) ** 2), 0) * 100;
}

function isCycleTerminalV1(status: RebalanceCycleV1["status"] | DaaStoreRebalanceCycleV1["status"]): boolean {
  return status === "completed" || status === "cancelled";
}

export function isCycleExecutableV1(status: RebalanceCycleV1["status"] | DaaStoreRebalanceCycleV1["status"]): boolean {
  return status === "generated" || status === "reviewing";
}

export function assertCycleMutableV1(cycle: { cycleId: string; status: RebalanceCycleV1["status"] | DaaStoreRebalanceCycleV1["status"] }) {
  if (!isCycleTerminalV1(cycle.status)) return;
  throw new WorkbenchDomainErrorV1(
    "CYCLE_IMMUTABLE",
    "该周期已终态，请生成新周期继续调仓。",
    {
      details: {
        cycleId: cycle.cycleId,
        cycleStatus: cycle.status,
      },
    },
  );
}

export function assertCycleExecutableV1(
  cycle: { cycleId: string; status: RebalanceCycleV1["status"] | DaaStoreRebalanceCycleV1["status"] },
  actionLabel: "execute" | "summary",
) {
  if (isCycleExecutableV1(cycle.status)) return;
  const code: WorkbenchDomainErrorCodeV1 = actionLabel === "execute" && cycle.status === "completed"
    ? "CYCLE_ALREADY_COMPLETED"
    : "CYCLE_NOT_EXECUTABLE";
  const message = actionLabel === "execute"
    ? "该周期不可执行，请生成新周期继续调仓。"
    : "该周期不可生成执行摘要，请生成新周期继续调仓。";
  throw new WorkbenchDomainErrorV1(
    code,
    message,
    {
      details: {
        cycleId: cycle.cycleId,
        cycleStatus: cycle.status,
      },
    },
  );
}

function buildPreTradeRiskCheckV1(input: {
  assetUniverse: WorkbenchBootstrapV1["assetUniverse"];
  proposals: RebalanceProposalV1[];
  totalEquity: number;
  constraints: {
    maxPositionPct: number;
    maxOrderPctOfNav: number;
  };
  risk: {
    perAssetStopLossPct: number;
    maxConcentrationPct: number;
  };
}): PreTradeRiskCheckV1 {
  const items: PreTradeRiskCheckItemV1[] = [];
  const maxPositionLimitPct = Math.max(0, input.constraints.maxPositionPct) * 100;
  const maxOrderPctOfNav = Math.max(0, input.constraints.maxOrderPctOfNav) * 100;
  const maxConcentrationPct = Math.max(0, input.risk.maxConcentrationPct) * 100;
  const stopLossPct = Math.max(0, input.risk.perAssetStopLossPct) * 100;

  const targetWeights = input.assetUniverse
    .filter((row) => row.watchEnabled && row.targetWeightPct > 0)
    .map((row) => ({ symbol: row.symbol, targetWeightPct: row.targetWeightPct }));
  const maxTarget = targetWeights.reduce((max, row) => Math.max(max, row.targetWeightPct), 0);
  const maxTargetRow = targetWeights.find((row) => row.targetWeightPct === maxTarget);
  items.push({
    rule: "max_position",
    status: maxTarget > maxPositionLimitPct ? "block" : "pass",
    current: maxTarget,
    limit: maxPositionLimitPct,
    message: maxTarget > maxPositionLimitPct
      ? `${maxTargetRow?.symbol || "标的"} 目标权重 ${maxTarget.toFixed(2)}% 超过上限 ${maxPositionLimitPct.toFixed(2)}%`
      : `单一持仓目标权重不超过 ${maxPositionLimitPct.toFixed(2)}%`,
  });

  const totalWeightPct = targetWeights.reduce((sum, row) => sum + row.targetWeightPct, 0);
  items.push({
    rule: "total_weight",
    status: totalWeightPct > 100.0001 ? "block" : "pass",
    current: totalWeightPct,
    limit: 100,
    message: totalWeightPct > 100.0001
      ? `目标权重总和 ${totalWeightPct.toFixed(2)}% 超过 100%`
      : `目标权重总和 ${totalWeightPct.toFixed(2)}%`,
  });

  const totalNotional = input.proposals.reduce((sum, row) => sum + Math.max(0, row.suggestedNotional), 0);
  const orderPctOfNav = input.totalEquity > 0 ? (totalNotional / input.totalEquity) * 100 : 0;
  items.push({
    rule: "max_order_pct",
    status: orderPctOfNav > maxOrderPctOfNav ? "warn" : "pass",
    current: orderPctOfNav,
    limit: maxOrderPctOfNav,
    message: orderPctOfNav > maxOrderPctOfNav
      ? `单日交易占比 ${orderPctOfNav.toFixed(2)}% 超过阈值 ${maxOrderPctOfNav.toFixed(2)}%`
      : `单日交易占比 ${orderPctOfNav.toFixed(2)}%`,
  });

  const hhi = computeHhiPctV1(targetWeights.map((row) => row.targetWeightPct));
  items.push({
    rule: "concentration",
    status: hhi > maxConcentrationPct ? "warn" : "pass",
    current: hhi,
    limit: maxConcentrationPct,
    message: hhi > maxConcentrationPct
      ? `组合集中度(HHI) ${hhi.toFixed(2)} 超过警戒 ${maxConcentrationPct.toFixed(2)}`
      : `组合集中度(HHI) ${hhi.toFixed(2)}`,
  });

  const worstDrawdown = input.assetUniverse.reduce((worst, row) => {
    const costPerUnit = calcHoldingCostPerUnitV1(row);
    if (!(row.holdingQty > 0) || !(costPerUnit > 0)) return worst;
    const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    if (!(price > 0)) return worst;
    const drawdownPct = ((costPerUnit - price) / costPerUnit) * 100;
    return Math.max(worst, drawdownPct);
  }, 0);
  items.push({
    rule: "stop_loss_breach",
    status: worstDrawdown > stopLossPct ? "warn" : "pass",
    current: worstDrawdown,
    limit: stopLossPct,
    message: worstDrawdown > stopLossPct
      ? `存在持仓浮亏 ${worstDrawdown.toFixed(2)}%，超过止损线 ${stopLossPct.toFixed(2)}%`
      : `持仓止损检查通过（最大浮亏 ${worstDrawdown.toFixed(2)}%）`,
  });

  const hasBlock = items.some((item) => item.status === "block");
  const hasWarn = items.some((item) => item.status === "warn");
  return {
    overallStatus: hasBlock ? "block" : (hasWarn ? "warn" : "pass"),
    items,
  };
}

function buildPreTradeRiskCheckFromBootstrapV1(input: {
  bootstrap: WorkbenchBootstrapV1;
  systemConfig: Awaited<ReturnType<typeof getDaaSystemConfigV2>>["config"];
  proposals: RebalanceProposalV1[];
}): PreTradeRiskCheckV1 {
  return buildPreTradeRiskCheckV1({
    assetUniverse: input.bootstrap.assetUniverse,
    proposals: input.proposals,
    totalEquity: Math.max(0, toFinite(input.bootstrap.account.totalEquity, 0)),
    constraints: {
      maxPositionPct: input.systemConfig.strategy.constraints.maxPositionPct,
      maxOrderPctOfNav: input.systemConfig.strategy.constraints.maxOrderPctOfNav,
    },
    risk: {
      perAssetStopLossPct: input.systemConfig.strategy.risk.perAssetStopLossPct,
      maxConcentrationPct: input.systemConfig.strategy.risk.maxConcentrationPct,
    },
  });
}

function buildManualPreTradeRiskCheckV1(input: {
  assetUniverse: WorkbenchBootstrapV1["assetUniverse"];
  proposal: RebalanceProposalV1;
  totalEquity: number;
  constraints: {
    maxPositionPct: number;
    maxOrderPctOfNav: number;
  };
  risk: {
    perAssetStopLossPct: number;
    maxConcentrationPct: number;
  };
}): PreTradeRiskCheckV1 {
  const items: PreTradeRiskCheckItemV1[] = [];
  const currentTotalEquity = Math.max(0, input.totalEquity);
  const maxPositionLimitPct = Math.max(0, input.constraints.maxPositionPct) * 100;
  const maxOrderPctOfNav = Math.max(0, input.constraints.maxOrderPctOfNav) * 100;
  const maxConcentrationPct = Math.max(0, input.risk.maxConcentrationPct) * 100;
  const stopLossPct = Math.max(0, input.risk.perAssetStopLossPct) * 100;

  const currentValueByAssetKey = new Map<string, number>();
  for (const row of input.assetUniverse) {
    currentValueByAssetKey.set(row.assetKey, Math.max(0, toFinite(row.valuationBase, 0)));
  }

  const currentProposalValue = currentValueByAssetKey.get(input.proposal.assetKey) || 0;
  const proposalNotional = Math.max(0, toFinite(input.proposal.suggestedNotional, 0));
  const proposalDelta = input.proposal.side === "BUY"
    ? proposalNotional
    : -proposalNotional;
  const nextProposalValue = Math.max(0, currentProposalValue + proposalDelta);

  const projectedAssetTotal = input.assetUniverse.reduce((sum, row) => {
    const currentValue = currentValueByAssetKey.get(row.assetKey) || 0;
    const nextValue = row.assetKey === input.proposal.assetKey ? nextProposalValue : currentValue;
    return sum + Math.max(0, nextValue);
  }, 0);
  const riskNavBase = currentTotalEquity > 0
    ? currentTotalEquity
    : Math.max(projectedAssetTotal, nextProposalValue, proposalNotional, 1e-9);

  const projectedWeights = input.assetUniverse
    .map((row) => {
      const currentValue = currentValueByAssetKey.get(row.assetKey) || 0;
      const nextValue = row.assetKey === input.proposal.assetKey ? nextProposalValue : currentValue;
      return {
        assetKey: row.assetKey,
        symbol: row.symbol,
        nextValue,
        weightPct: riskNavBase > 0 ? (nextValue / riskNavBase) * 100 : 0,
      };
    })
    .filter((row) => row.nextValue > 0);

  const projectedWeightPct = riskNavBase > 0 ? (nextProposalValue / riskNavBase) * 100 : 0;
  items.push({
    rule: "max_position",
    status: projectedWeightPct > maxPositionLimitPct ? "block" : "pass",
    current: projectedWeightPct,
    limit: maxPositionLimitPct,
    message: projectedWeightPct > maxPositionLimitPct
      ? `${input.proposal.symbol} 交易后仓位 ${projectedWeightPct.toFixed(2)}% 超过上限 ${maxPositionLimitPct.toFixed(2)}%`
      : `${input.proposal.symbol} 交易后仓位 ${projectedWeightPct.toFixed(2)}%`,
  });

  const investedWeightPct = projectedWeights.reduce((sum, row) => sum + row.weightPct, 0);
  items.push({
    rule: "total_weight",
    status: investedWeightPct > 100.0001 ? "block" : "pass",
    current: investedWeightPct,
    limit: 100,
    message: investedWeightPct > 100.0001
      ? `交易后持仓权重总和 ${investedWeightPct.toFixed(2)}% 超过 100%`
      : `交易后已投资仓位 ${investedWeightPct.toFixed(2)}%`,
  });

  const orderPctOfNav = riskNavBase > 0 ? (proposalNotional / riskNavBase) * 100 : 0;
  items.push({
    rule: "max_order_pct",
    status: orderPctOfNav > maxOrderPctOfNav ? "warn" : "pass",
    current: orderPctOfNav,
    limit: maxOrderPctOfNav,
    message: orderPctOfNav > maxOrderPctOfNav
      ? `单日交易占比 ${orderPctOfNav.toFixed(2)}% 超过阈值 ${maxOrderPctOfNav.toFixed(2)}%`
      : `单日交易占比 ${orderPctOfNav.toFixed(2)}%`,
  });

  const hhi = computeHhiPctV1(projectedWeights.map((row) => row.weightPct));
  items.push({
    rule: "concentration",
    status: hhi > maxConcentrationPct ? "warn" : "pass",
    current: hhi,
    limit: maxConcentrationPct,
    message: hhi > maxConcentrationPct
      ? `交易后组合集中度(HHI) ${hhi.toFixed(2)} 超过警戒 ${maxConcentrationPct.toFixed(2)}`
      : `交易后组合集中度(HHI) ${hhi.toFixed(2)}`,
  });

  const worstDrawdown = input.assetUniverse.reduce((worst, row) => {
    const costPerUnit = calcHoldingCostPerUnitV1(row);
    if (!(row.holdingQty > 0) || !(costPerUnit > 0)) return worst;
    const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    if (!(price > 0)) return worst;
    const drawdownPct = ((costPerUnit - price) / costPerUnit) * 100;
    return Math.max(worst, drawdownPct);
  }, 0);
  items.push({
    rule: "stop_loss_breach",
    status: worstDrawdown > stopLossPct ? "warn" : "pass",
    current: worstDrawdown,
    limit: stopLossPct,
    message: worstDrawdown > stopLossPct
      ? `存在持仓浮亏 ${worstDrawdown.toFixed(2)}%，超过止损线 ${stopLossPct.toFixed(2)}%`
      : `持仓止损检查通过（最大浮亏 ${worstDrawdown.toFixed(2)}%）`,
  });

  const hasBlock = items.some((item) => item.status === "block");
  const hasWarn = items.some((item) => item.status === "warn");
  return {
    overallStatus: hasBlock ? "block" : (hasWarn ? "warn" : "pass"),
    items,
  };
}

function mapStoreCycleToViewV1(cycle: DaaStoreRebalanceCycleV1 | null): RebalanceCycleV1 | null {
  if (!cycle) return null;
  return {
    cycleId: cycle.cycleId,
    status: cycle.status,
    triggerSource: cycle.triggerSource,
    triggerReason: cycle.triggerReason,
    snapshotAt: cycle.snapshotAt,
    equitySnapshot: cycle.equitySnapshot,
    driftSnapshot: cycle.driftSnapshot,
    proposals: cycle.proposals,
    riskCheck: cycle.riskCheck,
    executedAt: cycle.executedAt,
    executedOrders: cycle.executedOrders,
    executionSummary: cycle.executionSummary,
    cancelledAt: cycle.cancelledAt,
    cancelReason: cycle.cancelReason,
    notes: cycle.notes,
    marketContext: cycle.marketContext || null,
    createdAt: cycle.createdAt,
  };
}

function buildMarketFactsV1(marketContext: DaaMarketContextV1 | null | undefined): string[] {
  if (!marketContext) return [];
  return marketContext.scopes.slice(0, 4).map((scope) => {
    const lead = scope.indicators[0] || null;
    const value = lead?.rawValue == null ? "N/A" : `${lead.rawValue}${lead.unit || ""}`;
    const percentile = lead?.percentile252 == null ? "N/A" : `${lead.percentile252.toFixed(1)}%`;
    return `${scope.label} ${marketRegimeLabelZhV1(scope.regime)} / 买入 ${Math.round(scope.buyScale * 100)}% / ${lead?.label || "指标"} ${value} / 近一年位置 ${percentile}`;
  });
}

function pickCycleMarketRegimesV1(cycle: RebalanceCycleV1 | null, fallback: DaaMarketContextV1 | null): {
  ruleBasedMarketRegime: DaaMarketRegimeV1 | null;
  llmMarketRegime: DaaMarketRegimeV1 | null;
  effectiveMarketRegime: DaaMarketRegimeV1 | null;
} {
  const firstDecision = cycle?.proposals.find((item) => item.decisionContext)?.decisionContext || null;
  return {
    ruleBasedMarketRegime: firstDecision?.ruleBasedMarketRegime || cycle?.marketContext?.regime || fallback?.regime || null,
    llmMarketRegime: firstDecision?.llmMarketRegime || null,
    effectiveMarketRegime: firstDecision?.effectiveMarketRegime || firstDecision?.marketRegime || cycle?.marketContext?.regime || fallback?.regime || null,
  };
}

function mapStoreCycleReportToViewV1(report: Awaited<ReturnType<typeof getDaaCycleReportV1>>): WorkbenchRebalanceCycleReportV1 | null {
  if (!report) return null;
  return {
    cycleId: report.cycleId,
    triggerSource: report.triggerSource,
    status: report.cycleStatus,
    createdAt: report.cycleCreatedAt,
    reportCreatedAt: report.reportCreatedAt,
    executionSummary: report.executionSummary,
    beforeSnapshot: report.beforeSnapshot,
    afterSnapshot: report.afterSnapshot,
    pnlAttribution: report.pnlAttribution,
    riskDelta: report.riskDelta,
  };
}

function buildTargetWeightsFromConfigV1(input: {
  targetWeightsRaw: Record<string, unknown>;
  assetRows: Array<{ assetKey: string; symbol: string; watchEnabled: boolean; targetWeightHint: number }>;
}): Record<string, number> {
  const out: Record<string, number> = {};
  const watchRows = input.assetRows.filter((row) => row.watchEnabled);

  for (const [rawKey, rawValue] of Object.entries(input.targetWeightsRaw || {})) {
    const weight = Number(rawValue);
    const keyText = normalizeText(rawKey).toUpperCase();
    if (!keyText) {
      throw new Error("targetWeights key must not be empty");
    }
    if (!Number.isFinite(weight)) {
      throw new Error(`targetWeights[${keyText}] must be a finite number`);
    }
    if (weight < 0) {
      throw new Error(`targetWeights[${keyText}] must be non-negative`);
    }
    if (weight === 0) continue;

    const parsedAssetKey = parseDaaAssetKeyV1(keyText);
    if (!parsedAssetKey) {
      throw new Error(`targetWeights key ${keyText} is invalid, expected MARKET::SYMBOL`);
    }
    const assetKey = `${parsedAssetKey.market}::${parsedAssetKey.symbol}`;
    out[assetKey] = (out[assetKey] ?? 0) + weight;
  }

  for (const row of watchRows) {
    if (!row.assetKey) continue;
    const parsedAssetKey = parseDaaAssetKeyV1(row.assetKey);
    if (!parsedAssetKey) {
      throw new Error(`asset universe row has invalid assetKey: ${row.assetKey}`);
    }
    const hint = Math.max(0, toFinite(row.targetWeightHint, 0));
    if (hint > 0) {
      out[row.assetKey] = hint;
      continue;
    }
    if (out[row.assetKey] != null) {
      delete out[row.assetKey];
    }
  }

  return out;
}

function computeTotalEquityV1(input: {
  rows: Array<{ symbol: string; market: string; currency: string; holdingQty: number; holdingPrice: number; lastPrice: number }>;
  fxRates: Array<{ baseCcy: string; quoteCcy: string; rate: number }>;
  baseCurrency: string;
  cash: number;
}): number {
  const fxLookup = buildFxLookupToBaseV1(input.fxRates);
  return summarizeMarkToMarketPortfolioV1({
    positions: input.rows.map((row) => ({
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
      qty: toPositive(row.holdingQty, 0),
      lastPrice: row.lastPrice,
      holdingPrice: row.holdingPrice,
    })),
    baseCurrency: input.baseCurrency,
    cash: input.cash,
    fxLookup,
  }).totalEquity;
}

function priceAgeSecV1(ts: string | null): number | null {
  const iso = normalizeText(ts);
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

export async function syncWorkbenchPricesV1(opts: {
  maxTargets?: number;
  timeoutMs?: number;
  concurrency?: number;
  forceRefreshAll?: boolean;
} = {}): Promise<{ updated: number; attempted: number; skipped: number }> {
  const [rows, system] = await Promise.all([
    listDaaAssetUniverseV1(),
    getDaaSystemConfigV2(),
  ]);
  const forceRefreshAll = opts.forceRefreshAll === true;
  const defaultMaxTargets = forceRefreshAll ? rows.length : PRICE_SYNC_MAX_TARGETS;
  const maxTargets = Math.max(1, Math.min(100, Math.trunc(opts.maxTargets ?? defaultMaxTargets)));
  const timeoutMs = Math.max(600, Math.min(8000, Math.trunc(opts.timeoutMs ?? PRICE_SYNC_TIMEOUT_MS)));
  const concurrency = Math.max(1, Math.min(12, Math.trunc(opts.concurrency ?? PRICE_SYNC_CONCURRENCY)));
  const marketCache = system.config.dataSources.priceFeed.marketCache;

  const targets = (forceRefreshAll
    ? rows
    : rows.filter((row) => {
      if (!(row.lastPrice > 0)) return true;
      const ageSec = priceAgeSecV1(row.priceUpdatedAt);
      if (ageSec == null) return true;
      if (ageSec <= PRICE_REFRESH_FRESH_SKIP_SEC) return false;
      return ageSec >= PRICE_STALE_SEC;
    })
  ).slice(0, maxTargets);

  if (!targets.length) {
    return { updated: 0, attempted: 0, skipped: rows.length };
  }

  const priced = await getMarketPricesWithCacheV1({
    assets: targets.map((row) => ({
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
    })),
    allowRefresh: true,
    forceRefresh: true,
    refreshBudget: targets.length,
    timeoutMs,
    source: "workbench_bootstrap",
    concurrency,
    freshSec: Math.max(60, marketCache.freshMinutes * 60),
    serveStaleSec: Math.max(3600, marketCache.serveStaleHours * 3600),
    rawRetentionDays: marketCache.rawRetentionDays,
  });

  let updated = 0;
  const historyRows: Array<{ assetKey: string; price: number; ts: string; source: string }> = [];

  for (const current of targets) {
    const key = `${String(current.market || "").toUpperCase()}::${String(current.symbol || "").toUpperCase()}`;
    const priceRow = priced[key];
    if (!priceRow || !(priceRow.price > 0) || !priceRow.priceUpdatedAt) continue;
    const updatedAt = priceRow.priceUpdatedAt;
    const saved = await updateDaaAssetUniverseLastPriceV1({
      assetKey: current.assetKey,
      lastPrice: priceRow.price,
      priceUpdatedAt: updatedAt,
    });
    if (!saved) continue;
    updated += 1;
    historyRows.push({
      assetKey: current.assetKey,
      price: priceRow.price,
      ts: updatedAt,
      source: "workbench_bootstrap",
    });
  }

  if (historyRows.length > 0) {
    try {
      await appendAssetPriceHistoryRowsV1(historyRows);
    } catch {
      // 行情历史附加失败不影响主流程
    }
  }

  return {
    updated,
    attempted: targets.length,
    skipped: Math.max(0, rows.length - targets.length),
  };
}

export async function buildUnifiedRequestFromStoreV1(): Promise<{
  request: DaaUnifiedRequestV1;
  baseCurrency: string;
  assetRows: Awaited<ReturnType<typeof listDaaAssetUniverseV1>>;
}> {
  const [systemRow, assetRows, fxRates, snapshots] = await Promise.all([
    getDaaSystemConfigV2(),
    listDaaAssetUniverseV1(),
    listDaaFxRatesV1(),
    listDaaEquitySnapshotsV1(365),
  ]);

  const strategy = systemRow.config.strategy;
  const accountRaw = strategy.account || {};
  const baseCurrency = normalizeDaaCurrencyCodeV1(accountRaw.baseCurrency, "USD");
  const cash = toPositive(accountRaw.cash, 0);
  const frozenCash = toPositive(accountRaw.frozenCash, 0);
  const investableCashRaw = toFinite(accountRaw.investableCash, Number.NaN);
  const investableCash = Number.isFinite(investableCashRaw)
    ? Math.max(0, Math.min(cash, investableCashRaw))
    : Math.max(0, cash - frozenCash);

  const totalEquity = computeTotalEquityV1({
    rows: assetRows,
    fxRates,
    baseCurrency,
    cash,
  });
  const equityPeakFromSnapshots = snapshots.reduce((max, row) => Math.max(max, toPositive(row.totalEquity, 0)), 0);
  const equityPeak = Math.max(totalEquity, equityPeakFromSnapshots);

  const targetWeights = buildTargetWeightsFromConfigV1({
    targetWeightsRaw: (strategy.targetWeights || {}) as Record<string, unknown>,
    assetRows: assetRows.map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      watchEnabled: row.watchEnabled,
      targetWeightHint: row.targetWeightHint,
    })),
  });

  const request: DaaUnifiedRequestV1 = {
    account: {
      baseCurrency,
      cash,
      investableCash,
      frozenCash,
      totalEquity,
      equityPeak: equityPeak > 0 ? equityPeak : undefined,
    },
    constraints: {
      maxPositionPct: toPositive(strategy.constraints?.maxPositionPct, 0),
      minNotional: toPositive(strategy.constraints?.minNotional, 0),
      maxOrderPctOfNav: toPositive(strategy.constraints?.maxOrderPctOfNav, 0),
    },
    policy: {
      baseDriftTriggerPct: toPositive(strategy.policy?.baseDriftTriggerPct, 0),
      strongTrendDriftTriggerPct: toPositive(strategy.policy?.strongTrendDriftTriggerPct, 0),
      riskOffConsensusPct: toPositive(strategy.policy?.riskOffConsensusPct, 0),
      riskOffScalePct: toPositive(strategy.policy?.riskOffScalePct, 0),
      valueTrapThesisDriftPct: toPositive(strategy.policy?.valueTrapThesisDriftPct, 0),
      sbIsolationScorePct: toPositive(strategy.policy?.sbIsolationScorePct, 0),
    },
    risk: {
      maxDrawdownPct: toPositive(strategy.risk?.maxDrawdownPct, 0),
      perAssetStopLossPct: toPositive(strategy.risk?.perAssetStopLossPct, 0),
      maxConcentrationPct: toPositive(strategy.risk?.maxConcentrationPct, 0),
      correlationCapPct: toPositive(strategy.risk?.correlationCapPct, 0),
      maxTotalRiskExposurePct: toPositive(strategy.risk?.maxTotalRiskExposurePct, 0),
    },
    targetWeights,
    positions: assetRows
      .filter((row) => row.holdingQty > 0)
      .map((row) => ({
        symbol: row.symbol,
        market: row.market,
        currency: row.currency,
        qty: row.holdingQty,
        price: row.lastPrice > 0 ? row.lastPrice : row.holdingPrice,
        costBasisPerUnit: calcHoldingCostPerUnitV1(row) ?? undefined,
        tags: row.holdingTags,
      })),
    candidateAssets: assetRows
      .filter((row) => row.watchEnabled)
      .map((row) => ({
        symbol: row.symbol,
        market: row.market,
        currency: row.currency,
        enabled: row.watchEnabled,
        targetWeightHint: row.targetWeightHint,
        tags: row.watchTags,
        notes: row.notes ?? undefined,
      })),
    fxRates: fxRates.map((row) => ({
      baseCcy: row.baseCcy,
      quoteCcy: row.quoteCcy,
      rate: row.rate,
      source: row.source,
      asOfTs: row.asOfTs,
    })),
    analysts: [],
    assetViews: [],
  };

  return { request, baseCurrency, assetRows };
}

function buildRecommendationRowsV1(input: {
  result: UnifiedDecisionResultV2;
  decisionId: string | null;
  assetRows: Awaited<ReturnType<typeof listDaaAssetUniverseV1>>;
}): WorkbenchRecommendationV1[] {
  const priceByAssetKey = new Map<string, number>();
  for (const row of input.assetRows) {
    const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    if (price > 0) priceByAssetKey.set(row.assetKey, price);
  }

  const opportunityByAssetKey = new Map<string, UnifiedDecisionResultV2["opportunityPanel"]["opportunities"][number]>();
  for (const opp of input.result.opportunityPanel.opportunities) {
    const symbol = normalizeDaaSymbolV1(opp.symbol);
    if (!symbol) continue;
    const matched = input.assetRows.find((row) => normalizeDaaSymbolV1(row.symbol) === symbol);
    if (matched) {
      opportunityByAssetKey.set(matched.assetKey, opp);
    }
  }

  return input.result.plan.executableOrders.map((order, index) => {
    const parsed = parseDaaAssetKeyV1(order.assetKey || order.symbol);
    const symbol = normalizeDaaSymbolV1(parsed?.symbol || order.symbol);
    const market = normalizeText(parsed?.market || order.market || "US").toUpperCase() || "US";
    const assetKey = parsed ? `${parsed.market}::${parsed.symbol}` : `${market}::${symbol}`;
    const currency = normalizeDaaCurrencyCodeV1(order.instrumentCurrency, "USD");
    const suggestedNotional = toPositive(order.notional, 0);
    const price = toPositive(order.price, 0) || priceByAssetKey.get(assetKey) || 0;
    const suggestedQty = toPositive(order.qty, 0) || (price > 0 ? suggestedNotional / price : 0);
    const opp = opportunityByAssetKey.get(assetKey);

    return {
      id: `${assetKey}-${order.side}-${index + 1}`,
      assetKey,
      symbol,
      market,
      currency,
      side: order.side,
      suggestedNotional,
      suggestedQty,
      price,
      reasons: Array.isArray(order.cappedBy) ? order.cappedBy.slice(0, 4) : [],
      decisionRefId: input.decisionId,
      action: opp?.action || "watch",
      actionLabelZh: actionLabelZhV1(opp?.action || "watch"),
      reasonZh: reasonZhV1(opp?.reasons || []),
      riskZh: riskZhV1(toPositive(opp?.riskScorePct, 50), opp?.reasons || []),
    } satisfies WorkbenchRecommendationV1;
  });
}

function buildBlockedReasonsV1(result: UnifiedDecisionResultV2): string[] {
  const byReason = new Map<string, number>();
  for (const row of result.plan.blockedOrders || []) {
    const reason = normalizeText(row.blockedBy);
    if (!reason) continue;
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  return [...byReason.entries()].map(([reason, count]) => `${reason} (${count})`);
}

function buildWorkbenchMarketDataHealthV1(input: {
  cacheReadFailed: boolean;
  stats: Awaited<ReturnType<typeof getDaaMarketCacheHealthStatsV1>>;
}): NonNullable<WorkbenchBootstrapV1["marketDataHealth"]> {
  const totalTracked = Math.max(0, input.stats.freshCount + input.stats.staleCount + input.stats.missingCount);
  const staleRatio = totalTracked > 0 ? input.stats.staleCount / totalTracked : 0;
  const missingRatio = totalTracked > 0 ? input.stats.missingCount / totalTracked : 0;

  let status: NonNullable<WorkbenchBootstrapV1["marketDataHealth"]>["status"] = "ok";
  if (
    input.cacheReadFailed
    || input.stats.recentJobFailureRatePct >= 80
    || (totalTracked > 0 && input.stats.freshCount === 0 && (input.stats.missingCount > 0 || input.stats.staleCount > 0))
  ) {
    status = "down";
  } else if (
    input.stats.recentJobFailureRatePct >= 20
    || input.stats.missingCount > 0
    || staleRatio >= 0.4
    || missingRatio >= 0.2
  ) {
    status = "degraded";
  }

  let message = "市场数据缓存正常。";
  if (status === "down") {
    message = input.cacheReadFailed
      ? "市场数据缓存读取失败，工作台已回退到本地快照，价格可能偏旧。"
      : `市场数据服务不可用：近 24 小时失败率 ${input.stats.recentJobFailureRatePct.toFixed(1)}%，fresh ${input.stats.freshCount} / stale ${input.stats.staleCount} / missing ${input.stats.missingCount}。`;
  } else if (status === "degraded") {
    message = `市场数据部分降级：fresh ${input.stats.freshCount} / stale ${input.stats.staleCount} / missing ${input.stats.missingCount}，近 24 小时失败率 ${input.stats.recentJobFailureRatePct.toFixed(1)}%。`;
  }

  return {
    status,
    freshCount: input.stats.freshCount,
    staleCount: input.stats.staleCount,
    missingCount: input.stats.missingCount,
    recentJobFailureRatePct: input.stats.recentJobFailureRatePct,
    message,
  };
}

export async function buildWorkbenchBootstrapV1(opts: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
  forceRefreshAllPrices?: boolean;
  maxSyncTargets?: number;
} = {}): Promise<WorkbenchBootstrapV1> {
  const shouldSyncPrices = opts.syncPrices !== false;
  const shouldAutoRiskCycle = opts.autoRiskCycle === true;

  if (shouldSyncPrices) {
    try {
      await syncWorkbenchPricesV1({
        forceRefreshAll: opts.forceRefreshAllPrices === true,
        maxTargets: opts.maxSyncTargets,
      });
    } catch {
      // 行情同步失败不阻塞工作台加载
    }
  }

  const [systemRow, rows, fxRates, allTickets, hfSignalMap, rebalanceCyclesRaw, marketCacheStats] = await Promise.all([
    getDaaSystemConfigV2(),
    listDaaAssetUniverseV1(),
    listDaaFxRatesV1(),
    listDaaTradeTicketsV1({ limit: 500 }),
    buildHfSignalMapV1(),
    listDaaRebalanceCyclesV1(100),
    getDaaMarketCacheHealthStatsV1(),
  ]);
  let rebalanceCycles = [...rebalanceCyclesRaw];

  const strategy = systemRow.config.strategy;
  const accountRaw = strategy.account || {};
  const baseCurrency = normalizeDaaCurrencyCodeV1(accountRaw.baseCurrency, "USD");
  const cash = toPositive(accountRaw.cash, 0);
  const frozenCash = toPositive(accountRaw.frozenCash, 0);
  const investableCashRaw = toFinite(accountRaw.investableCash, Number.NaN);
  const investableCash = Number.isFinite(investableCashRaw)
    ? Math.max(0, Math.min(cash, investableCashRaw))
    : Math.max(0, cash - frozenCash);

  const marketCache = systemRow.config.dataSources.priceFeed.marketCache;
  let priceContextByKey: Record<string, Awaited<ReturnType<typeof getMarketPricesWithCacheV1>>[string]> = {};
  let marketCacheReadFailed = false;
  try {
    priceContextByKey = await getMarketPricesWithCacheV1({
      assets: rows.map((row) => ({
        symbol: row.symbol,
        market: row.market,
        currency: row.currency,
      })),
      allowRefresh: false,
      freshSec: Math.max(60, marketCache.freshMinutes * 60),
      serveStaleSec: Math.max(3600, marketCache.serveStaleHours * 3600),
      rawRetentionDays: marketCache.rawRetentionDays,
      source: "workbench_bootstrap_context",
    });
  } catch {
    marketCacheReadFailed = true;
    priceContextByKey = {};
  }

  const targetWeights = buildTargetWeightsFromConfigV1({
    targetWeightsRaw: (strategy.targetWeights || {}) as Record<string, unknown>,
    assetRows: rows.map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      watchEnabled: row.watchEnabled,
      targetWeightHint: row.targetWeightHint,
    })),
  });

  const rowsWithPriceContext = rows.map((row) => {
    const key = `${String(row.market || "").toUpperCase()}::${String(row.symbol || "").toUpperCase()}`;
    const priceContext = priceContextByKey[key];
    return {
      ...row,
      lastPrice: priceContext && priceContext.price > 0 ? priceContext.price : row.lastPrice,
      priceUpdatedAt: priceContext?.priceUpdatedAt || row.priceUpdatedAt,
    };
  });

  const assetUniverseBase = buildAssetUniverseViewRowsV1({
    rows: rowsWithPriceContext,
    fxRates,
    baseCurrency,
    cash,
    targetWeights,
  });
  const assetUniverse = assetUniverseBase.map((row) => {
    const key = `${String(row.market || "").toUpperCase()}::${String(row.symbol || "").toUpperCase()}`;
    const priceContext = priceContextByKey[key];
    const nextStatus = priceContext
      ? (priceContext.price > 0
        ? priceContext.priceStatus
        : (row.priceStatus === "unsupported" ? row.priceStatus : priceContext.priceStatus))
      : row.priceStatus;
    return {
      ...row,
      priceStatus: nextStatus,
      priceSource: priceContext?.priceSource || row.priceSource,
      priceAgeSec: priceContext?.priceAgeSec ?? row.priceAgeSec,
      hfSignal: hfSignalMap.get(row.symbol) || null,
    };
  });

  const holdingsValue = assetUniverse
    .filter((row) => row.holdingQty > 0)
    .reduce((sum, row) => sum + Math.max(0, toFinite(row.valuationBase, 0)), 0);
  const totalEquity = holdingsValue + cash;

  const logs = allTickets
    .filter((ticket) => ticket.status !== "ready")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 200);

  const warnings: string[] = [];
  const marketDataHealth = buildWorkbenchMarketDataHealthV1({
    cacheReadFailed: marketCacheReadFailed,
    stats: marketCacheStats,
  });
  if (marketCacheReadFailed) {
    warnings.push("市场缓存读取失败，工作台已回退到库内快照，当前价格可能偏旧。");
  }
  const fxMissingCount = assetUniverse.filter((row) => row.fxMissing).length;
  if (fxMissingCount > 0) {
    warnings.push(`存在 ${fxMissingCount} 个资产缺少汇率，权重和估值已按可用数据计算。`);
  }

  const staleCount = assetUniverse.filter((row) => row.priceStatus === "stale").length;
  const missingCount = assetUniverse.filter((row) => row.priceStatus === "missing").length;
  if (staleCount > 0) {
    warnings.push(`存在 ${staleCount} 个资产行情抓取时间超过 ${Math.floor(PRICE_STALE_SEC / 3600)} 小时。`);
  }
  if (missingCount > 0) {
    warnings.push(`存在 ${missingCount} 个资产暂时无可用价格，相关标的暂不可执行市价单。`);
  }
  if (marketDataHealth.status !== "ok" && !warnings.includes(marketDataHealth.message)) {
    warnings.push(marketDataHealth.message);
  }

  let marketContext: DaaMarketContextV1 | null = null;
  try {
    marketContext = await getCurrentMarketContextV1({ allowStale: true });
  } catch {
    marketContext = null;
  }

  const rebalanceStrategy = systemRow.config.rebalanceStrategy;
  if (shouldAutoRiskCycle) {
    const riskDraft = buildRiskCycleDraftV1({
      bootstrap: {
        baseCurrency,
        account: {
          cash,
          investableCash,
          frozenCash,
          totalEquity,
        },
        assetUniverse,
        execution: { logs: [] },
        rebalance: {
          mode: rebalanceStrategy.autoGenerateEnabled ? "auto" : "manual",
          autoAnalysisEnabled: rebalanceStrategy.autoGenerateEnabled,
          analysisTimeUtc: rebalanceStrategy.analysisTimeUtc,
          timezone: rebalanceStrategy.timezone,
          emailTo: rebalanceStrategy.notifyEmailTo,
          analysisFocus: rebalanceStrategy.analysisFocus,
        },
        rebalanceStrategy,
        overviewAlerts: [],
        latestCycle: null,
        marketContext,
        warnings: [],
        marketDataHealth,
      },
      perAssetStopLossPct: systemRow.config.strategy.risk.perAssetStopLossPct,
      perAssetTakeProfitPct: systemRow.config.strategy.risk.perAssetTakeProfitPct,
    });
    if (riskDraft) {
      const cooldownMs = Math.max(1, rebalanceStrategy.cooldownHours) * 60 * 60 * 1000;
      const nowMs = Date.now();
      const draftSymbols = new Set(riskDraft.proposals.map((row) => row.symbol.toUpperCase()));
      const inCooldownConflict = rebalanceCycles.some((cycle) => {
        if (cycle.triggerSource !== "risk") return false;
        const createdMs = Date.parse(cycle.createdAt || cycle.snapshotAt);
        if (!Number.isFinite(createdMs) || createdMs + cooldownMs <= nowMs) return false;
        const cycleSymbols = new Set(cycle.proposals.map((row) => row.symbol.toUpperCase()));
        for (const symbol of draftSymbols) {
          if (cycleSymbols.has(symbol)) return true;
        }
        return false;
      });

      if (!inCooldownConflict) {
        const riskCheck = buildPreTradeRiskCheckV1({
          assetUniverse,
          proposals: riskDraft.proposals,
          totalEquity: Math.max(0, toFinite(totalEquity, 0)),
          constraints: {
            maxPositionPct: systemRow.config.strategy.constraints.maxPositionPct,
            maxOrderPctOfNav: systemRow.config.strategy.constraints.maxOrderPctOfNav,
          },
          risk: {
            perAssetStopLossPct: systemRow.config.strategy.risk.perAssetStopLossPct,
            maxConcentrationPct: systemRow.config.strategy.risk.maxConcentrationPct,
          },
        });
        try {
          const createdRiskCycle = await createDaaRebalanceCycleV1({
            triggerSource: "risk",
            triggerReason: riskDraft.triggerReason,
            snapshotAt: new Date().toISOString(),
            equitySnapshot: Math.max(0, toFinite(totalEquity, 0)),
            driftSnapshot: riskDraft.driftSnapshot,
            proposals: riskDraft.proposals,
            riskCheck,
            marketContext,
          });
          await appendTriggerEventSafeV1({
            triggerSource: "risk",
            triggerReason: riskDraft.triggerReason,
            cycleId: createdRiskCycle.cycleId,
            status: "accepted",
            detailsJson: {
              hitSymbols: riskDraft.riskHits.map((item) => item.symbol),
            },
          });
          rebalanceCycles = [createdRiskCycle, ...rebalanceCycles.filter((row) => row.cycleId !== createdRiskCycle.cycleId)];
        } catch {
          // 风险触发写入失败不阻塞工作台加载
        }
      } else {
        await appendTriggerEventSafeV1({
          triggerSource: "risk",
          triggerReason: riskDraft.triggerReason,
          status: "skipped",
          detailsJson: {
            reason: "cooldown_conflict",
            hitSymbols: riskDraft.riskHits.map((item) => item.symbol),
          },
        });
      }
    }
  }
  const latestCycle = mapStoreCycleToViewV1(rebalanceCycles[0] || null);

  const overviewAlerts: WorkbenchBootstrapV1["overviewAlerts"] = [];
  const maxDriftRow = assetUniverse
    .filter((row) => row.gapPct != null)
    .sort((a, b) => Math.abs(b.gapPct || 0) - Math.abs(a.gapPct || 0))[0];
  if (maxDriftRow && Math.abs(maxDriftRow.gapPct || 0) > rebalanceStrategy.drift.thresholdPct * 100) {
    overviewAlerts.push({
      id: `risk-${maxDriftRow.assetKey}`,
      kind: "risk",
      level: "warn",
      text: `${maxDriftRow.symbol} 偏移 ${Number(maxDriftRow.gapPct || 0).toFixed(2)}%，超过阈值 ${(rebalanceStrategy.drift.thresholdPct * 100).toFixed(2)}%`,
      createdAt: new Date().toISOString(),
    });
  }

  const highlightedHf = assetUniverse.find((row) => row.hfSignal && row.hfSignal.level !== "none");
  if (highlightedHf?.hfSignal) {
    overviewAlerts.push({
      id: `hf-${highlightedHf.assetKey}`,
      kind: "hf",
      level: highlightedHf.hfSignal.level === "bearish" ? "warn" : "info",
      text: `人因信号：${highlightedHf.symbol} ${highlightedHf.hfSignal.icon} ${highlightedHf.hfSignal.label}`,
      createdAt: new Date().toISOString(),
    });
  }

  if (rebalanceStrategy.calendar.enabled) {
    const nextDueAt = nextCalendarDueDateV1({
      frequency: rebalanceStrategy.calendar.frequency,
      dayOfMonth: rebalanceStrategy.calendar.dayOfMonth,
    });
    overviewAlerts.push({
      id: "next-calendar-cycle",
      kind: "schedule",
      level: "success",
      text: `下次定期再平衡：${nextDueAt.slice(0, 10)}`,
      createdAt: new Date().toISOString(),
    });
  }

  for (const scope of marketContext?.scopes || []) {
    if (scope.regime !== "risk_off") continue;
    overviewAlerts.push({
      id: `market-${scope.scope}`,
      kind: "market",
      level: "warn",
      text: `${scope.label}进入 ${marketRegimeLabelZhV1(scope.regime)}，普通买入执行 ${Math.round(scope.buyScale * 100)}%，高波动买入执行 ${Math.round(scope.highRiskBuyScale * 100)}%`,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    baseCurrency,
    account: {
      cash,
      investableCash,
      frozenCash,
      totalEquity,
    },
    assetUniverse,
    execution: {
      logs,
    },
    rebalance: {
      mode: rebalanceStrategy.autoGenerateEnabled ? "auto" : "manual",
      autoAnalysisEnabled: rebalanceStrategy.autoGenerateEnabled,
      analysisTimeUtc: rebalanceStrategy.analysisTimeUtc,
      timezone: rebalanceStrategy.timezone,
      emailTo: rebalanceStrategy.notifyEmailTo,
      analysisFocus: rebalanceStrategy.analysisFocus,
    },
    rebalanceStrategy: {
      calendar: rebalanceStrategy.calendar,
      drift: rebalanceStrategy.drift,
      cooldownHours: rebalanceStrategy.cooldownHours,
      analysisTimeUtc: rebalanceStrategy.analysisTimeUtc,
      timezone: rebalanceStrategy.timezone,
      analysisFocus: rebalanceStrategy.analysisFocus,
      autoGenerateEnabled: rebalanceStrategy.autoGenerateEnabled,
      notifyEmailTo: rebalanceStrategy.notifyEmailTo,
    },
    overviewAlerts,
    latestCycle,
    marketContext,
    warnings,
    marketDataHealth,
  };
}

export async function runWorkbenchRecommendationsV1(input: {
  analysisFocus?: string;
  triggerSource?: "manual" | "cron_scheduled";
}): Promise<WorkbenchRecommendationsResultV1> {
  const analysisFocus = normalizeText(input.analysisFocus) || DEFAULT_ANALYSIS_FOCUS_V1;
  const triggerSource = input.triggerSource === "cron_scheduled" ? "cron_scheduled" : "manual";
  const { request, assetRows } = await buildUnifiedRequestFromStoreV1();
  const hydrated = await hydrateUnifiedRequestWithSignalsV1(request);
  const plan = buildDaaUnifiedPlanV1(hydrated.request);
  let marketContext: DaaMarketContextV1 | null = null;
  try {
    marketContext = await getCurrentMarketContextV1({ allowStale: true });
  } catch {
    marketContext = null;
  }

  const llmAnalysis = await runLlmAnalysisV1({
    analysisContext: "decision",
    baseCurrency: plan.summary.baseCurrency,
    shouldRebalance: plan.summary.shouldRebalance,
    analysisFocus,
    opportunities: hydrated.opportunityPanel.opportunities.map((item) => ({
      symbol: item.symbol,
      finalScorePct: item.finalScorePct,
      confidencePct: item.confidencePct,
      riskScorePct: item.riskScorePct,
      action: item.action,
      reasons: item.reasons,
    })),
    warnings: plan.warnings,
    marketContext,
  });

  const decisionResult: UnifiedDecisionResultV2 = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    plan,
    opportunityPanel: hydrated.opportunityPanel,
    hydrationDiagnostics: hydrated.diagnostics,
    llmAnalysis,
  };

  const created = await createDaaRebalanceDecisionV1({
    requestJson: hydrated.request as unknown as Record<string, unknown>,
    responseJson: decisionResult as unknown as Record<string, unknown>,
    shouldRebalance: Boolean(plan.summary.shouldRebalance),
    triggerSource,
  });

  const decisionId = created.decision.id;
  const decisionStatus = created.decision.status;

  try {
    await appendDaaRunHistoryV1({
      requestJson: hydrated.request as unknown as Record<string, unknown>,
      responseJson: {
        ...decisionResult,
        decisionId,
        decisionStatus,
      } as Record<string, unknown>,
      summaryJson: {
        ...(plan.summary as unknown as Record<string, unknown>),
        decisionId,
        decisionStatus,
        fusionWeights: hydrated.opportunityPanel.diagnostics.weights,
      },
      triggerSource,
    });
  } catch {
    // 运行历史记录失败不阻塞结果返回
  }

  return {
    decisionId,
    decisionStatus,
    summary: {
      shouldRebalance: plan.summary.shouldRebalance,
      executableOrderCount: plan.summary.executableOrderCount,
      blockedOrderCount: plan.summary.blockedOrderCount,
      totalEquity: plan.summary.totalEquity,
      baseCurrency: plan.summary.baseCurrency,
    },
    recommendations: buildRecommendationRowsV1({
      result: decisionResult,
      decisionId,
      assetRows,
    }),
    blockedReasons: buildBlockedReasonsV1(decisionResult),
    warnings: [...plan.warnings],
    insightDigest: {
      topOpportunities: hydrated.opportunityPanel.opportunities.slice(0, 5).map((item) => ({
        symbol: item.symbol,
        action: item.action,
        actionLabelZh: actionLabelZhV1(item.action),
        finalScorePct: item.finalScorePct,
        confidencePct: item.confidencePct,
        reasons: item.reasons.slice(0, 3),
        reasonZh: reasonZhV1(item.reasons),
      })),
    },
    riskDigest: {
      warnings: [...plan.warnings],
      blockedReasons: buildBlockedReasonsV1(decisionResult),
    },
    marketContext,
  };
}

function buildCycleDraftFromBootstrapV1(input: {
  bootstrap: WorkbenchBootstrapV1;
  triggerReason?: string;
}): {
  triggerReason: string;
  driftSnapshot: RebalanceCycleV1["driftSnapshot"];
  proposals: RebalanceProposalV1[];
  maxAbsDriftPct: number;
  maxAbsDriftRow: WorkbenchBootstrapV1["assetUniverse"][number] | null;
} {
  const totalEquity = Math.max(0, toFinite(input.bootstrap.account.totalEquity, 0));
  const driftSnapshot: RebalanceCycleV1["driftSnapshot"] = [];
  const proposals: RebalanceProposalV1[] = [];

  let maxAbsDrift = 0;
  let maxAbsDriftRow: WorkbenchBootstrapV1["assetUniverse"][number] | null = null;

  for (const row of input.bootstrap.assetUniverse) {
    if (!(row.watchEnabled || row.holdingQty > 0)) continue;
    const actualPct = toFinite(row.actualWeightPct, 0) / 100;
    const targetPct = toFinite(row.targetWeightPct, 0) / 100;
    const driftPct = actualPct - targetPct;
    driftSnapshot.push({
      assetKey: row.assetKey,
      symbol: row.symbol,
      actualPct,
      targetPct,
      driftPct,
    });
    const absDrift = Math.abs(driftPct);
    if (absDrift > maxAbsDrift) {
      maxAbsDrift = absDrift;
      maxAbsDriftRow = row;
    }
    if (absDrift < 0.001) continue;

    const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    if (!(price > 0) || !(totalEquity > 0)) continue;
    const suggestedNotional = Math.abs(driftPct) * totalEquity;
    if (!(suggestedNotional > 0)) continue;
    const fxRateToBase = row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : null;
    const localNotional = fxRateToBase ? (suggestedNotional / fxRateToBase) : suggestedNotional;
    const suggestedQty = localNotional / price;
    proposals.push({
      assetKey: row.assetKey,
      symbol: row.symbol,
      currency: row.currency,
      fxRateToBase,
      side: driftPct > 0 ? "SELL" : "BUY",
      suggestedQty,
      suggestedNotional,
      price,
      reason: `偏移 ${(driftPct * 100).toFixed(2)}%，回归目标权重`,
      selected: true,
      hfContribution: row.hfSignal
        ? `${row.hfSignal.icon} ${row.hfSignal.label} ${row.hfSignal.aggregatedScorePct.toFixed(1)}%`
        : null,
    });
  }

  const triggerReason = normalizeText(input.triggerReason)
    || (maxAbsDriftRow
      ? `${maxAbsDriftRow.symbol} 偏移 ${(maxAbsDrift * 100).toFixed(2)}%`
      : "组合偏移触发再平衡建议");
  return {
    triggerReason,
    driftSnapshot,
    proposals,
    maxAbsDriftPct: maxAbsDrift * 100,
    maxAbsDriftRow,
  };
}

function buildTriggerEventIdempotencyKeyV1(input: {
  triggerSource: RebalanceTriggerSourceV1;
  triggerReason: string;
  cycleId?: string | null;
}): string {
  const source = normalizeText(input.triggerSource).toLowerCase() || "manual";
  const reason = normalizeText(input.triggerReason).toLowerCase().replace(/\s+/g, "_").slice(0, 80) || "na";
  if (input.cycleId) return `cycle:${normalizeText(input.cycleId)}`;
  const hourSlot = new Date().toISOString().slice(0, 13);
  return `evt:${source}:${reason}:${hourSlot}`;
}

async function appendTriggerEventSafeV1(input: {
  triggerSource: RebalanceTriggerSourceV1;
  triggerReason: string;
  cycleId?: string | null;
  status: "accepted" | "skipped" | "conflict";
  detailsJson?: Record<string, unknown>;
}) {
  try {
    await appendDaaTriggerEventV1({
      idempotencyKey: buildTriggerEventIdempotencyKeyV1({
        triggerSource: input.triggerSource,
        triggerReason: input.triggerReason,
        cycleId: input.cycleId,
      }),
      triggerSource: input.triggerSource,
      triggerReason: input.triggerReason,
      cycleId: input.cycleId,
      status: input.status,
      detailsJson: input.detailsJson || {},
    });
  } catch {
    // 触发日志失败不阻塞主流程
  }
}

function calcHoldingCostPerUnitV1(row: Pick<WorkbenchBootstrapV1["assetUniverse"][number], "holdingQty" | "costBasis" | "holdingPrice">): number {
  if (row.holdingQty > 0 && row.costBasis != null && row.costBasis > 0) {
    return row.costBasis / row.holdingQty;
  }
  if (row.holdingPrice > 0) return row.holdingPrice;
  return 0;
}

function buildRiskCycleDraftV1(input: {
  bootstrap: WorkbenchBootstrapV1;
  perAssetStopLossPct: number;
  perAssetTakeProfitPct: number;
}): {
  triggerReason: string;
  proposals: RebalanceProposalV1[];
  driftSnapshot: RebalanceCycleV1["driftSnapshot"];
  riskHits: Array<{ symbol: string; kind: "stop_loss" | "take_profit"; pnlPct: number }>;
} | null {
  const stopLossPct = Math.max(0, input.perAssetStopLossPct) * 100;
  const takeProfitPct = Math.max(0, input.perAssetTakeProfitPct) * 100;
  const proposals: RebalanceProposalV1[] = [];
  const riskHits: Array<{ symbol: string; kind: "stop_loss" | "take_profit"; pnlPct: number }> = [];
  const driftSnapshot: RebalanceCycleV1["driftSnapshot"] = [];

  for (const row of input.bootstrap.assetUniverse) {
    if (!(row.watchEnabled || row.holdingQty > 0)) continue;
    driftSnapshot.push({
      assetKey: row.assetKey,
      symbol: row.symbol,
      actualPct: (row.actualWeightPct || 0) / 100,
      targetPct: (row.targetWeightPct || 0) / 100,
      driftPct: ((row.actualWeightPct || 0) - (row.targetWeightPct || 0)) / 100,
    });
    if (!(row.holdingQty > 0) || !(row.valuationBase && row.valuationBase > 0)) continue;
    const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    if (!(px > 0)) continue;
    const costPerUnit = calcHoldingCostPerUnitV1(row);
    if (!(costPerUnit > 0)) continue;
    const pnlPct = ((px - costPerUnit) / costPerUnit) * 100;
    const isStopLoss = stopLossPct > 0 && pnlPct <= -stopLossPct;
    const isTakeProfit = takeProfitPct > 0 && pnlPct >= takeProfitPct;
    if (!isStopLoss && !isTakeProfit) continue;

    const sellRatio = isStopLoss ? 1 : 0.5;
    const suggestedNotional = Math.max(0, (row.valuationBase || 0) * sellRatio);
    if (!(suggestedNotional > 0)) continue;
    const localNotional = row.fxRateToBase && row.fxRateToBase > 0 ? (suggestedNotional / row.fxRateToBase) : suggestedNotional;
    const suggestedQty = Math.min(row.holdingQty, localNotional / px);
    if (!(suggestedQty > 0)) continue;

    proposals.push({
      assetKey: row.assetKey,
      symbol: row.symbol,
      currency: row.currency,
      fxRateToBase: row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : null,
      side: "SELL",
      suggestedQty,
      suggestedNotional,
      price: px,
      reason: isStopLoss
        ? `触发止损阈值：浮亏 ${Math.abs(pnlPct).toFixed(2)}%`
        : `触发止盈阈值：浮盈 ${pnlPct.toFixed(2)}%`,
      selected: true,
      hfContribution: row.hfSignal ? `${row.hfSignal.icon} ${row.hfSignal.label}` : null,
    });
    riskHits.push({
      symbol: row.symbol,
      kind: isStopLoss ? "stop_loss" : "take_profit",
      pnlPct,
    });
  }

  if (!proposals.length || !riskHits.length) return null;
  const top = riskHits[0];
  const triggerReason = top.kind === "stop_loss"
    ? `${top.symbol} 触发止损(${Math.abs(top.pnlPct).toFixed(2)}%)`
    : `${top.symbol} 触发止盈(${top.pnlPct.toFixed(2)}%)`;
  return {
    triggerReason,
    proposals,
    driftSnapshot,
    riskHits,
  };
}

function calcPortfolioHhiPctV1(rows: WorkbenchBootstrapV1["assetUniverse"]): number {
  const weights = rows
    .filter((row) => row.holdingQty > 0 && (row.actualWeightPct || 0) > 0)
    .map((row) => Math.max(0, row.actualWeightPct || 0));
  if (!weights.length) return 0;
  return weights.reduce((sum, weightPct) => sum + ((weightPct / 100) ** 2), 0) * 100;
}

function calcMaxWeightPctV1(rows: WorkbenchBootstrapV1["assetUniverse"]): number {
  return rows.reduce((max, row) => Math.max(max, Math.max(0, toFinite(row.actualWeightPct, 0))), 0);
}

function calcMaxDriftPctV1(rows: WorkbenchBootstrapV1["assetUniverse"]): number {
  return rows.reduce((max, row) => Math.max(max, Math.abs(toFinite(row.gapPct, 0))), 0);
}

function calcMaxDrawdownPctV1(rows: WorkbenchBootstrapV1["assetUniverse"]): number {
  let worst = 0;
  for (const row of rows) {
    if (!(row.holdingQty > 0)) continue;
    const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    const costPerUnit = calcHoldingCostPerUnitV1(row);
    if (!(px > 0) || !(costPerUnit > 0)) continue;
    const drawdown = ((costPerUnit - px) / costPerUnit) * 100;
    worst = Math.max(worst, drawdown);
  }
  return Math.max(0, worst);
}

function toCycleReportSnapshotV1(bootstrap: WorkbenchBootstrapV1) {
  const holdingsValue = bootstrap.assetUniverse
    .filter((row) => row.holdingQty > 0)
    .reduce((sum, row) => sum + Math.max(0, toFinite(row.valuationBase, 0)), 0);
  return {
    totalEquity: Math.max(0, toFinite(bootstrap.account.totalEquity, 0)),
    holdingsValue,
    cash: Math.max(0, toFinite(bootstrap.account.cash, 0)),
    hhiPct: calcPortfolioHhiPctV1(bootstrap.assetUniverse),
    maxWeightPct: calcMaxWeightPctV1(bootstrap.assetUniverse),
    maxDriftPct: calcMaxDriftPctV1(bootstrap.assetUniverse),
    maxDrawdownPct: calcMaxDrawdownPctV1(bootstrap.assetUniverse),
  };
}

export async function runWorkbenchRiskCheckV1(input?: {
  cycleId?: string;
  selectedSymbols?: string[];
}): Promise<PreTradeRiskCheckV1> {
  const [bootstrap, systemRow, cycle] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: false }),
    getDaaSystemConfigV2(),
    input?.cycleId ? getDaaRebalanceCycleV1(input.cycleId) : Promise.resolve(null),
  ]);

  const selectedSet = new Set((input?.selectedSymbols || []).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean));
  const proposals = cycle
    ? cycle.proposals.filter((row) => {
      if (!selectedSet.size) return true;
      return selectedSet.has(row.symbol.toUpperCase());
    })
    : buildCycleDraftFromBootstrapV1({ bootstrap }).proposals;

  return buildPreTradeRiskCheckFromBootstrapV1({
    bootstrap,
    systemConfig: systemRow.config,
    proposals,
  });
}

export async function validateExecutionRiskV1(input: {
  cycleId?: string;
  selectedSymbols?: string[];
  manualProposal?: {
    assetKey: string;
    symbol: string;
    currency: string;
    side: "BUY" | "SELL";
    suggestedQty: number;
    suggestedNotional: number;
    price: number;
    reason?: string;
  };
}): Promise<PreTradeRiskCheckV1> {
  if (input.cycleId) {
    return runWorkbenchRiskCheckV1({
      cycleId: input.cycleId,
      selectedSymbols: input.selectedSymbols,
    });
  }
  const manualProposal = input.manualProposal;
  if (!manualProposal) {
    return runWorkbenchRiskCheckV1();
  }

  const [bootstrap, systemRow] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: false }),
    getDaaSystemConfigV2(),
  ]);

  const proposal: RebalanceProposalV1 = {
    assetKey: manualProposal.assetKey,
    symbol: manualProposal.symbol,
    currency: manualProposal.currency,
    fxRateToBase: bootstrap.assetUniverse.find((row) => row.assetKey === manualProposal.assetKey)?.fxRateToBase ?? null,
    side: manualProposal.side,
    suggestedQty: Math.max(0, toFinite(manualProposal.suggestedQty, 0)),
    suggestedNotional: Math.max(0, toFinite(manualProposal.suggestedNotional, 0)),
    price: Math.max(0, toFinite(manualProposal.price, 0)),
    reason: normalizeText(manualProposal.reason) || "manual_execution",
    selected: true,
    hfContribution: null,
  };

  return buildManualPreTradeRiskCheckV1({
    assetUniverse: bootstrap.assetUniverse,
    proposal,
    totalEquity: Math.max(0, toFinite(bootstrap.account.totalEquity, 0)),
    constraints: {
      maxPositionPct: systemRow.config.strategy.constraints.maxPositionPct,
      maxOrderPctOfNav: systemRow.config.strategy.constraints.maxOrderPctOfNav,
    },
    risk: {
      perAssetStopLossPct: systemRow.config.strategy.risk.perAssetStopLossPct,
      maxConcentrationPct: systemRow.config.strategy.risk.maxConcentrationPct,
    },
  });
}

export async function buildWorkbenchExecuteSummaryV1(input: {
  cycleId: string;
  executeMode: "selected" | "all";
}): Promise<ExecuteRebalanceSummaryV1> {
  const cycle = await getDaaRebalanceCycleV1(input.cycleId);
  if (!cycle) throw new Error(`cycle not found: ${input.cycleId}`);
  assertCycleExecutableV1(cycle, "summary");
  const [bootstrap, systemRow] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: false }),
    getDaaSystemConfigV2(),
  ]);
  const rows = cycle.proposals.filter((row) => input.executeMode === "all" || row.selected);
  const feeRateBps = getStrategyExecutionConfigV2(systemRow.config).feeRateBps;
  const feeRate = feeRateBps / 10000;
  const buyNotional = rows.filter((row) => row.side === "BUY").reduce((sum, row) => sum + row.suggestedNotional, 0);
  const sellNotional = rows.filter((row) => row.side === "SELL").reduce((sum, row) => sum + row.suggestedNotional, 0);
  const estimatedFees = rows.reduce((sum, row) => sum + (row.suggestedQty * row.price * feeRate), 0);
  const netCashImpact = sellNotional - buyNotional - estimatedFees;

  const totalEquity = Math.max(1e-9, toFinite(bootstrap.account.totalEquity, 0));
  const valuationBySymbol = new Map<string, number>();
  for (const row of bootstrap.assetUniverse) {
    valuationBySymbol.set(row.symbol.toUpperCase(), Math.max(0, toFinite(row.valuationBase, 0)));
  }
  const touched = new Set(rows.map((row) => row.symbol.toUpperCase()));
  const topWeightChanges = [...touched].map((symbol) => {
    const currentValue = valuationBySymbol.get(symbol) || 0;
    const delta = rows
      .filter((row) => row.symbol.toUpperCase() === symbol)
      .reduce((sum, row) => sum + (row.side === "BUY" ? row.suggestedNotional : -row.suggestedNotional), 0);
    const projectedValue = Math.max(0, currentValue + delta);
    const currentWeightPct = (currentValue / totalEquity) * 100;
    const projectedWeightPct = (projectedValue / totalEquity) * 100;
    return {
      symbol,
      currentWeightPct,
      projectedWeightPct,
      changePct: projectedWeightPct - currentWeightPct,
    };
  }).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 5);

  const riskCheck = await validateExecutionRiskV1({
    cycleId: cycle.cycleId,
    selectedSymbols: rows.map((row) => row.symbol),
  });
  const riskWarnings = riskCheck.items
    .filter((item) => item.status !== "pass")
    .map((item) => item.message);

  return {
    cycleId: cycle.cycleId,
    executeMode: input.executeMode,
    orderCount: rows.length,
    buyNotional,
    sellNotional,
    estimatedFees,
    netCashImpact,
    topWeightChanges,
    riskWarnings,
    riskOverallStatus: riskCheck.overallStatus,
  };
}

export async function generateWorkbenchRebalanceCycleV1(
  input: GenerateRebalanceCycleInputV1 = {},
): Promise<GenerateRebalanceCycleResultV1> {
  const triggerSource: RebalanceTriggerSourceV1 = input.triggerSource || "manual";
  const manual = input.manual === true || triggerSource === "manual";

  const [bootstrap, systemRow, recentCycles] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: true }),
    getDaaSystemConfigV2(),
    listDaaRebalanceCyclesV1(120),
  ]);

  const latestCycle = recentCycles[0] || null;
  const strategy = systemRow.config.rebalanceStrategy;
  const marketContext = bootstrap.marketContext || null;
  const now = new Date();
  let cooldownReferenceCycle: DaaStoreRebalanceCycleV1 | null = latestCycle;
  const skipWithLatest = (message: string, options: {
    skippedByCooldown?: boolean;
    cooldownUntil?: string | null;
    attachLatestCycle?: boolean;
  } = {}): GenerateRebalanceCycleResultV1 => {
    const attachedCycle = options.attachLatestCycle ? (cooldownReferenceCycle || latestCycle) : null;
    void appendTriggerEventSafeV1({
      triggerSource,
      triggerReason: message,
      cycleId: attachedCycle?.cycleId || null,
      status: options.skippedByCooldown ? "conflict" : "skipped",
      detailsJson: {
        skippedByCooldown: options.skippedByCooldown === true,
        cooldownUntil: options.cooldownUntil || null,
      },
    });
    return {
      cycle: attachedCycle ? mapStoreCycleToViewV1(attachedCycle) : null,
      created: false,
      skippedByCooldown: options.skippedByCooldown === true,
      cooldownUntil: options.cooldownUntil || null,
      message,
      portfolioStatus: "skipped",
      marketRegime: (attachedCycle ? mapStoreCycleToViewV1(attachedCycle)?.marketContext?.regime : null) || marketContext?.regime || null,
      llmSummary: null,
    };
  };

  if (!manual && triggerSource === "calendar") {
    if (!strategy.calendar.enabled) {
      return skipWithLatest("定期再平衡未启用，跳过自动生成。");
    }

    if (!isPastUtcTimeV1(now, strategy.analysisTimeUtc)) {
      return skipWithLatest(`未到定时分析窗口（UTC ${strategy.analysisTimeUtc}）`);
    }

    const timeZone = normalizeTimeZoneOrUtcV1(strategy.timezone);
    const today = getZonedYmdV1(now, timeZone);
    const dueDay = Math.max(1, Math.min(28, Math.trunc(strategy.calendar.dayOfMonth || 1)));
    if (today.day !== dueDay || !isCalendarMonthDueV1(today.month, strategy.calendar.frequency)) {
      return skipWithLatest(
        `当前不在定期再平衡窗口（${timeZone} 每${strategy.calendar.frequency === "monthly"
          ? "月"
          : (strategy.calendar.frequency === "quarterly"
            ? "季"
            : (strategy.calendar.frequency === "semi_annual" ? "半年" : "年"))}${dueDay}日）`,
      );
    }

    const currentPeriodKey = buildCalendarPeriodKeyV1({
      date: now,
      timeZone,
      frequency: strategy.calendar.frequency,
    });
    const duplicated = recentCycles.some((row) => {
      if (row.triggerSource !== "calendar") return false;
      const ms = Date.parse(row.createdAt || row.snapshotAt);
      if (!Number.isFinite(ms)) return false;
      const rowPeriodKey = buildCalendarPeriodKeyV1({
        date: new Date(ms),
        timeZone,
        frequency: strategy.calendar.frequency,
      });
      return rowPeriodKey === currentPeriodKey;
    });
    if (duplicated) {
      return skipWithLatest(`当前周期 ${currentPeriodKey} 已生成过定期再平衡建议`);
    }
  }

  if (!manual && triggerSource === "drift") {
    if (!strategy.drift.enabled) {
      return skipWithLatest("偏移触发未启用，跳过自动生成。");
    }

    if (strategy.drift.checkFrequency === "weekly") {
      const latestDriftCycle = recentCycles.find((row) => row.triggerSource === "drift") || null;
      if (latestDriftCycle) {
        const lastMs = Date.parse(latestDriftCycle.createdAt || latestDriftCycle.snapshotAt);
        const nextDueMs = Number.isFinite(lastMs) ? lastMs + (7 * 24 * 60 * 60 * 1000) : NaN;
        if (Number.isFinite(nextDueMs) && nextDueMs > Date.now()) {
          return skipWithLatest("偏移检查频率为每周，当前尚未到下一次检查窗口。");
        }
      }
    }
  }

  const cooldownHours = Math.max(1, systemRow.config.rebalanceStrategy.cooldownHours);
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const cooldownScopedTriggerSource = !manual && (triggerSource === "drift" || triggerSource === "calendar")
    ? triggerSource
    : null;
  const latestAutoComparableCycle = cooldownScopedTriggerSource
    ? (recentCycles.find((row) => row.triggerSource === cooldownScopedTriggerSource) || null)
    : null;
  cooldownReferenceCycle = latestAutoComparableCycle || latestCycle;
  if (cooldownScopedTriggerSource && latestAutoComparableCycle) {
    const lastMs = Date.parse(latestAutoComparableCycle.createdAt || latestAutoComparableCycle.snapshotAt);
    if (Number.isFinite(lastMs) && lastMs + cooldownMs > Date.now()) {
      return skipWithLatest(
        `冷静期生效中，${cooldownHours} 小时内不重复自动触发`,
        { skippedByCooldown: true, cooldownUntil: toIsoByMs(lastMs + cooldownMs), attachLatestCycle: true },
      );
    }
  }

  // ── Step A: 计算 drift draft（纯数学，保持不变）─────────────────────
  const draft = buildCycleDraftFromBootstrapV1({
    bootstrap,
    triggerReason: input.triggerReason,
  });

  // ── drift 触发的阈值守卫（仅自动触发需要）────────────────────────
  if (!manual && triggerSource === "drift") {
    const thresholdPct = Math.max(0, strategy.drift.thresholdPct * 100);
    if (!(draft.maxAbsDriftPct > thresholdPct)) {
      return skipWithLatest(
        `最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}% 未超过阈值 ${thresholdPct.toFixed(2)}%`,
      );
    }
  }

  // ── Step B: 现金三层分类 ─────────────────────────────────────────
  // P1-2: strategy.cash 已在 RebalanceStrategyConfigV1 中定义，无需 as any
  const cashConfig = strategy.cash ?? {};
  const cashClassification = classifyCashV2({
    totalCash: bootstrap.account.cash,
    frozenCash: bootstrap.account.frozenCash,
    totalEquity: bootstrap.account.totalEquity ?? 0,
    assetUniverse: bootstrap.assetUniverse.map((row) => ({
      holdingQty: row.holdingQty,
      valuationBase: row.valuationBase,
      targetWeightPct: row.targetWeightPct,
      holdingTags: row.holdingTags ?? [],
    })),
    config: {
      operationalReservePct: toFinite(cashConfig.operationalReservePct, 0),
      idleThresholdPct: toFinite(cashConfig.idleThresholdPct, 0.1),
      idleCooldownDays: toFinite(cashConfig.idleCooldownDays, 7),
    },
    lastDepositAt: cashConfig.lastDepositAt ?? null,
  });

  // ── 手动触发 + 无 proposals → 组合健康，返回洞察快照 ─────────────
  // 自动触发场景下（calendar/drift/cash_idle）不返回 healthy，因为空 proposals
  // 意味着已被上面的阈值守卫拦截或通过其他逻辑处理。
  if (draft.proposals.length === 0 && manual) {
    const hasTargetAssets = bootstrap.assetUniverse.some((row) => row.watchEnabled && row.targetWeightPct > 0);
    const hasMeaningfulDrift = draft.maxAbsDriftPct > 0.001;
    const totalEquity = Math.max(0, bootstrap.account.totalEquity ?? 0);
    const hasExecutableTargetPricing = bootstrap.assetUniverse.some((row) => (
      row.watchEnabled
      && row.targetWeightPct > 0
      && !row.fxMissing
      && (row.lastPrice > 0 || row.holdingPrice > 0)
    ));

    if (hasMeaningfulDrift && hasTargetAssets && totalEquity <= 0) {
      return skipWithLatest("当前组合尚未建立可计算权益，请先入金或校准持仓后再生成建议。");
    }

    if (hasMeaningfulDrift && hasTargetAssets && !hasExecutableTargetPricing) {
      return skipWithLatest("目标资产缺少可执行价格或汇率，请先刷新行情 / FX 后再生成建议。");
    }

    // 尝试获取信号洞察（非阻断，失败则返回空快照）
    let healthyInsight: PortfolioHealthyInsightV1 = {
      maxDriftPct: draft.maxAbsDriftPct,
      topOpportunities: [],
      llmSummary: null,
      cashIdleWarning: cashClassification.cashIdleWarning,
      cashIdlePct: cashClassification.investableIdlePct,
      generatedAt: new Date().toISOString(),
    };

    try {
      const { request: unifiedRequest } = await buildUnifiedRequestFromStoreV1();
      const hydrated = await hydrateUnifiedRequestWithSignalsV1(unifiedRequest);
      const analysisFocus = normalizeText(input.analysisFocus)
        || strategy.analysisFocus
        || DEFAULT_ANALYSIS_FOCUS_V1;

      // 简化 LLM 调用：仅获取 summary，不做 per-asset 调整
      const llmResult = await runLlmDecisionV2({
        baseCurrency: bootstrap.baseCurrency,
        totalEquity: bootstrap.account.totalEquity ?? 0,
        cashClassification,
        draftProposals: [],
        fusedOpportunities: hydrated.opportunityPanel.opportunities,
        warnings: bootstrap.warnings,
        analysisFocus,
        marketContext,
      });

      healthyInsight = {
        maxDriftPct: draft.maxAbsDriftPct,
        topOpportunities: hydrated.opportunityPanel.opportunities.slice(0, 5).map((opp) => ({
          symbol: opp.symbol,
          action: opp.action,
          finalScorePct: opp.finalScorePct,
          confidencePct: opp.confidencePct,
        })),
        llmSummary: llmResult.status === "ok" ? llmResult.summary : null,
        cashIdleWarning: cashClassification.cashIdleWarning,
        cashIdlePct: cashClassification.investableIdlePct,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      // 洞察加载失败不影响主流程
    }

    void appendTriggerEventSafeV1({
      triggerSource,
      triggerReason: `组合已接近目标，最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}%，无需调仓`,
      cycleId: null,
      status: "skipped",
      detailsJson: { reason: "portfolio_healthy", maxDriftPct: draft.maxAbsDriftPct },
    });

    return {
      cycle: null,
      created: false,
      skippedByCooldown: false,
      cooldownUntil: null,
      message: `组合已处于目标配置，最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}%，无需调仓`,
      portfolioStatus: "healthy",
      healthyInsight,
      marketRegime: marketContext?.regime || null,
      llmSummary: healthyInsight.llmSummary,
    };
  }

  // ── Step C: 信号富化（四路信号融合）────────────────────────────────
  // 对 draft proposals 中涉及的资产，获取 fused opportunities
  let fusedOpportunities: Awaited<ReturnType<typeof hydrateUnifiedRequestWithSignalsV1>>["opportunityPanel"]["opportunities"] = [];
  try {
    const { request: unifiedRequest } = await buildUnifiedRequestFromStoreV1();
    const hydrated = await hydrateUnifiedRequestWithSignalsV1(unifiedRequest);
    fusedOpportunities = hydrated.opportunityPanel.opportunities;
  } catch {
    // 信号加载失败不阻断再平衡，降级为纯 drift 模式
    bootstrap.warnings.push("信号加载失败，当前再平衡建议仅基于漂移计算，未融合多路信号。");
  }

  // ── Step D: LLM 结构化决策分析 ──────────────────────────────────
  const analysisFocus = normalizeText(input.analysisFocus)
    || strategy.analysisFocus
    || DEFAULT_ANALYSIS_FOCUS_V1;

  const llmDecision = await runLlmDecisionV2({
    baseCurrency: bootstrap.baseCurrency,
    totalEquity: bootstrap.account.totalEquity ?? 0,
    cashClassification,
    draftProposals: draft.proposals.map((p) => ({
      symbol: p.symbol,
      side: p.side,
      // P0-3: driftPct 需要带符号：BUY=负（低配），SELL=正（超配）
      // suggestedNotional 始终为正值，需根据 side 还原方向
      driftPct: (p.side === "SELL" ? 1 : -1) * p.suggestedNotional / Math.max(1, bootstrap.account.totalEquity ?? 1),
      suggestedNotional: p.suggestedNotional,
    })),
    fusedOpportunities,
    warnings: bootstrap.warnings,
    analysisFocus,
    marketContext,
  });

  // ── Step E: 三层决策融合（drift × signal × LLM）──────────────────
  const assetMetaBySymbol = Object.fromEntries(
    bootstrap.assetUniverse.map((row) => [row.symbol.toUpperCase(), {
      market: row.market,
      assetClass: row.assetClass,
      marketGroup: row.marketGroup,
      instrumentType: row.instrumentType,
      region: row.region,
      exchange: row.exchange,
      holdingTags: row.holdingTags,
      watchTags: row.watchTags,
    }]),
  );
  const fusionResult = fuseDecisionV2({
    draftProposals: draft.proposals,
    fusedOpportunities,
    llmDecision,
    marketContext,
    marketConfig: systemRow.config.dataSources.marketIndicators,
    assetMetaBySymbol,
  });

  // 将融合警告追加到系统 warnings
  const allWarnings = [...bootstrap.warnings, ...fusionResult.fusionWarnings];

  // ── Step F: 风险检查（使用融合后的建议）──────────────────────────
  const riskCheck = buildPreTradeRiskCheckFromBootstrapV1({
    bootstrap,
    systemConfig: systemRow.config,
    proposals: fusionResult.proposals.filter((p) => p.selected),
  });

  // ── Step G: 创建 Cycle（proposals 已含 decisionContext）──────────
  // 构建 notes：记录 LLM 状态和融合摘要，供审计追踪
  const cycleNotes = [
    `LLM状态: ${llmDecision.status}`,
    marketContext ? `规则市场环境: ${marketRegimeLabelZhV1(marketContext.regime)} / 风险分 ${marketContext.riskOffScorePct.toFixed(1)}` : null,
    llmDecision.status === "ok" ? `AI 市场环境: ${marketRegimeLabelZhV1(llmDecision.marketRegime)}` : null,
    fusionResult.marketRegime ? `最终生效市场环境: ${marketRegimeLabelZhV1(fusionResult.marketRegime)}` : null,
    marketContext ? `关键市场指标摘要: ${buildMarketFactsV1(marketContext).slice(0, 3).join(" | ")}` : null,
    llmDecision.status === "ok" ? `AI总结: ${llmDecision.summary.slice(0, 80)}` : null,
    fusionResult.fusionWarnings.length > 0
      ? `融合警告: ${fusionResult.fusionWarnings.slice(0, 2).join(" | ")}`
      : null,
    cashClassification.cashIdleWarning
      ? `现金提示: 闲置资金 ${(cashClassification.investableIdlePct * 100).toFixed(1)}%（已${cashClassification.cashIdleDays}天）`
      : null,
  ].filter(Boolean).join("\n");

  const created = await createDaaRebalanceCycleV1({
    triggerSource,
    triggerReason: draft.triggerReason,
    snapshotAt: new Date().toISOString(),
    equitySnapshot: Math.max(0, toFinite(bootstrap.account.totalEquity, 0)),
    driftSnapshot: draft.driftSnapshot,
    proposals: fusionResult.proposals,
    riskCheck,
    notes: cycleNotes || null,
    marketContext,
  });

  await appendTriggerEventSafeV1({
    triggerSource,
    triggerReason: draft.triggerReason,
    cycleId: created.cycleId,
    status: "accepted",
    detailsJson: {
      proposalCount: fusionResult.proposals.length,
      riskOverallStatus: riskCheck.overallStatus,
      llmStatus: llmDecision.status,
      ruleBasedMarketRegime: marketContext?.regime || null,
      marketRegime: fusionResult.marketRegime,
      fusionWarningCount: fusionResult.fusionWarnings.length,
      cashIdleWarning: cashClassification.cashIdleWarning,
    },
  });

  return {
    cycle: mapStoreCycleToViewV1(created),
    created: true,
    skippedByCooldown: false,
    cooldownUntil: null,
    message: `已生成再平衡周期 ${created.cycleId}`,
    portfolioStatus: "needs_rebalance",
    marketRegime: fusionResult.marketRegime || marketContext?.regime || null,
    llmSummary: llmDecision.status === "ok" ? llmDecision.summary : null,
  };
}

export async function listWorkbenchTradeRecordsV1(limit = 120): Promise<WorkbenchTradeRecordsV1> {
  const [cycles, orders] = await Promise.all([
    listDaaRebalanceCyclesV1(limit),
    listDaaTradeTicketsV1({ limit: Math.max(200, limit * 2) }),
  ]);
  return {
    cycles: cycles.map((row) => mapStoreCycleToViewV1(row)!).filter(Boolean),
    orders: orders,
  };
}

export async function listWorkbenchRebalanceReportsV1(limit = 50): Promise<WorkbenchRebalanceCycleReportV1[]> {
  const reports = await listDaaCycleReportsV1(limit);
  return reports.map((item) => mapStoreCycleReportToViewV1(item)).filter(Boolean) as WorkbenchRebalanceCycleReportV1[];
}

export async function getWorkbenchRebalanceCycleReportV1(cycleId: string): Promise<WorkbenchRebalanceCycleReportV1 | null> {
  const report = await getDaaCycleReportV1(cycleId);
  return mapStoreCycleReportToViewV1(report);
}

export async function updateWorkbenchRebalanceCycleV1(
  cycleId: string,
  input: UpdateRebalanceCycleInputV1,
): Promise<RebalanceCycleV1> {
  const current = await getDaaRebalanceCycleV1(cycleId);
  if (!current) throw new Error(`cycle not found: ${cycleId}`);
  assertCycleMutableV1(current);

  let proposals = current.proposals;
  let nextRiskCheck = current.riskCheck;
  if (Array.isArray(input.selectedSymbols)) {
    const selectedSet = new Set(input.selectedSymbols.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean));
    proposals = proposals.map((row) => ({
      ...row,
      selected: selectedSet.has(row.symbol.toUpperCase()),
    }));

    const [bootstrap, systemRow] = await Promise.all([
      buildWorkbenchBootstrapV1({ syncPrices: false }),
      getDaaSystemConfigV2(),
    ]);
    nextRiskCheck = buildPreTradeRiskCheckFromBootstrapV1({
      bootstrap,
      systemConfig: systemRow.config,
      proposals: proposals.filter((row) => row.selected),
    });
  }

  const patchInput: Parameters<typeof patchDaaRebalanceCycleV1>[0] = {
    cycleId,
    proposals,
    riskCheck: nextRiskCheck,
    notes: input.notes === undefined ? current.notes : input.notes,
  };
  if (input.status === "reviewing") {
    patchInput.status = "reviewing";
  }
  if (input.cancel) {
    patchInput.status = "cancelled";
    patchInput.cancelledAt = new Date().toISOString();
    patchInput.cancelReason = normalizeText(input.cancel.reason) || "用户取消";
  }

  const patched = await patchDaaRebalanceCycleV1(patchInput);
  const mapped = mapStoreCycleToViewV1(patched);
  if (!mapped) throw new Error("cycle update failed");
  return mapped;
}

export async function executeWorkbenchRebalanceCycleV1(input: {
  cycleId: string;
  executeMode: "selected" | "all";
}): Promise<ExecuteRebalanceCycleResultV1> {
  const cycle = await getDaaRebalanceCycleV1(input.cycleId);
  if (!cycle) throw new Error(`cycle not found: ${input.cycleId}`);
  assertCycleExecutableV1(cycle, "execute");

  const toExecute = cycle.proposals.filter((row) => input.executeMode === "all" || row.selected);
  if (!toExecute.length) {
    const reviewed = await patchDaaRebalanceCycleV1({
      cycleId: input.cycleId,
      status: "reviewing",
    });
    return {
      cycle: mapStoreCycleToViewV1(reviewed)!,
      logs: await listDaaTradeTicketsV1({ limit: 200 }),
    };
  }

  const [preTradeRiskCheck, systemRow, beforeBootstrap] = await Promise.all([
    validateExecutionRiskV1({
      cycleId: input.cycleId,
      selectedSymbols: toExecute.map((row) => row.symbol),
    }),
    getDaaSystemConfigV2(),
    buildWorkbenchBootstrapV1({ syncPrices: false }),
  ]);
  const enforceOnExecution = systemRow.config.strategy.risk.enforceOnExecution !== false;
  const feeRateBps = getStrategyExecutionConfigV2(systemRow.config).feeRateBps;
  const feeRate = feeRateBps / 10000;
  if (enforceOnExecution && preTradeRiskCheck.overallStatus === "block") {
    await patchDaaRebalanceCycleV1({
      cycleId: input.cycleId,
      status: "reviewing",
      riskCheck: preTradeRiskCheck,
    });
    const blockedItem = preTradeRiskCheck.items.find((item) => item.status === "block");
    throw new Error(`RISK_BLOCKED:${JSON.stringify({
      code: "RISK_BLOCKED",
      rule: blockedItem?.rule || "unknown",
      message: blockedItem?.message || "执行前风控阻断",
      current: blockedItem?.current ?? null,
      limit: blockedItem?.limit ?? null,
    })}`);
  }

  await patchDaaRebalanceCycleV1({
    cycleId: input.cycleId,
    status: "executing",
    riskCheck: preTradeRiskCheck,
  });

  const createdTicketIds: string[] = [];
  for (const row of toExecute) {
    if (!(row.price > 0) || !(row.suggestedQty > 0)) continue;
    const parsed = parseDaaAssetKeyV1(row.assetKey);
    const fee = Math.max(0, row.suggestedQty * row.price * feeRate);
    const created = await createDaaTradeTicketV1({
      source: "decision",
      cycleId: input.cycleId,
      assetKey: row.assetKey,
      symbol: row.symbol,
      market: parsed?.market || "US",
      instrumentCurrency: normalizeDaaCurrencyCodeV1(row.currency, "USD"),
      side: row.side,
      qty: row.suggestedQty,
      price: row.price,
      fee,
      pricingMode: "market",
      priceSource: "rebalance_cycle",
      decisionRefId: input.cycleId,
      reasonText: row.reason,
      reasonTags: ["rebalance_cycle"],
      createdBy: "workbench.rebalance",
    });
    createdTicketIds.push(created.ticketId);
  }

  const execution = createdTicketIds.length
    ? await executeDaaTradeTicketsV1({ ticketIds: createdTicketIds })
    : null;

  const executedCount = execution
    ? execution.results.filter((item) => item.status === "executed").length
    : 0;
  const failedCount = execution
    ? execution.results.filter((item) => item.status !== "executed").length
    : 0;
  const totalNotional = toExecute.reduce((sum, row) => sum + row.suggestedNotional, 0);
  const newMaxDriftPct = cycle.driftSnapshot.reduce((max, row) => Math.max(max, Math.abs(row.driftPct * 100)), 0);

  const completed = await patchDaaRebalanceCycleV1({
    cycleId: input.cycleId,
    status: "completed",
    executedAt: new Date().toISOString(),
    executedOrders: createdTicketIds,
    executionSummary: {
      ordersExecuted: executedCount,
      ordersFailed: failedCount,
      totalNotional,
      newMaxDriftPct,
    },
  });

  const [logs, afterBootstrap] = await Promise.all([
    listDaaTradeTicketsV1({ limit: 300 }),
    buildWorkbenchBootstrapV1({ syncPrices: false }),
  ]);

  try {
    const beforeSnapshot = toCycleReportSnapshotV1(beforeBootstrap);
    const afterSnapshot = toCycleReportSnapshotV1(afterBootstrap);
    const cycleLogs = logs.filter((row) => createdTicketIds.includes(row.ticketId));
    const feeTotal = cycleLogs
      .filter((row) => row.status === "executed")
      .reduce((sum, row) => sum + Math.max(0, row.fee), 0);

    const beforeBySymbol = new Map(beforeBootstrap.assetUniverse.map((row) => [row.symbol.toUpperCase(), row]));
    const realizedBySymbol = new Map<string, number>();
    for (const row of cycleLogs) {
      if (row.status !== "executed" || row.side !== "SELL") continue;
      const before = beforeBySymbol.get(row.symbol.toUpperCase());
      if (!before) continue;
      const costPerUnit = calcHoldingCostPerUnitV1(before);
      const fx = before.fxRateToBase && before.fxRateToBase > 0 ? before.fxRateToBase : 1;
      const pnl = (row.price - costPerUnit) * row.qty * fx;
      realizedBySymbol.set(row.symbol, (realizedBySymbol.get(row.symbol) || 0) + pnl);
    }
    let unrealizedPnl = 0;
    for (const row of afterBootstrap.assetUniverse) {
      if (!(row.holdingQty > 0)) continue;
      const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
      const costPerUnit = calcHoldingCostPerUnitV1(row);
      const fx = row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : 1;
      unrealizedPnl += (px - costPerUnit) * row.holdingQty * fx;
    }
    const topContributors = [...realizedBySymbol.entries()]
      .map(([symbol, pnl]) => ({ symbol, pnl, side: "SELL" as const }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 5);
    const realizedPnl = [...realizedBySymbol.values()].reduce((sum, value) => sum + value, 0);

    await upsertDaaCycleReportV1({
      cycleId: input.cycleId,
      beforeSnapshot,
      afterSnapshot,
      executionStats: {
        ordersExecuted: executedCount,
        ordersFailed: failedCount,
        totalNotional,
        newMaxDriftPct,
        feeTotal,
      },
      pnlAttribution: {
        realizedPnl,
        unrealizedPnl,
        feeTotal,
        fxImpact: 0,
        topContributors,
      },
      riskDelta: {
        maxDrawdownBefore: beforeSnapshot.maxDrawdownPct,
        maxDrawdownAfter: afterSnapshot.maxDrawdownPct,
        hhiBefore: beforeSnapshot.hhiPct,
        hhiAfter: afterSnapshot.hhiPct,
        maxWeightBefore: beforeSnapshot.maxWeightPct,
        maxWeightAfter: afterSnapshot.maxWeightPct,
        maxDriftBefore: beforeSnapshot.maxDriftPct,
        maxDriftAfter: afterSnapshot.maxDriftPct,
      },
    });
  } catch {
    // 复盘报告生成失败不阻塞交易主流程
  }

  return {
    cycle: mapStoreCycleToViewV1(completed)!,
    logs: logs.filter((row) => row.status !== "ready").slice(0, 200),
  };
}

export function normalizeExecutionLogFiltersV1(input: {
  status?: unknown;
  source?: unknown;
  limit?: unknown;
}): { status?: "ready" | "executed" | "canceled" | "rejected"; source?: "manual" | "decision"; limit: number } {
  const statusText = normalizeText(input.status).toLowerCase();
  const status = statusText === "ready" || statusText === "executed" || statusText === "canceled" || statusText === "rejected"
    ? statusText
    : undefined;

  const sourceText = normalizeText(input.source).toLowerCase();
  const source = sourceText === "manual" || sourceText === "decision" ? sourceText : undefined;

  const limitRaw = Math.trunc(toFinite(input.limit, 200));
  const limit = Math.max(1, Math.min(500, limitRaw || 200));

  return { status, source, limit };
}

export function normalizeTradeSideV1(value: unknown): "BUY" | "SELL" | null {
  const side = normalizeText(value).toUpperCase();
  if (side === "BUY" || side === "SELL") return side;
  return null;
}

export function normalizeReasonTagsV1(value: unknown): string[] {
  return pickArray(value).map((item) => item.toLowerCase());
}

export function mapOpportunityActionLabelZhV1(action: string): string {
  return actionLabelZhV1(action);
}

export function summarizeOpportunityReasonZhV1(reasons: string[]): string {
  return reasonZhV1(reasons);
}

export function summarizeOpportunityRiskZhV1(riskScorePct: number, reasons: string[]): string {
  return riskZhV1(riskScorePct, reasons);
}
