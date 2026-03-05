import { normalizeDaaCurrencyCodeV1, normalizeDaaSymbolV1, parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";
import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import type { UnifiedDecisionResultV2 } from "@/src/daa/modules/decision/decisionResultTypesV2";
import {
  appendDaaRunHistoryV1,
  appendPriceHistoryRowsV1,
  createDaaRebalanceCycleV1,
  createDaaRebalanceDecisionV1,
  createDaaTradeTicketV1,
  executeDaaTradeTicketsV1,
  getDaaHumanIngestStateV1,
  getDaaRebalanceCycleV1,
  getDaaSystemConfigV2,
  listDaaAssetUniverseV1,
  listDaaEquitySnapshotsV1,
  listDaaFxRatesV1,
  listDaaRebalanceCyclesV1,
  listDaaTradeTicketsV1,
  patchDaaRebalanceCycleV1,
  updateDaaAssetUniverseLastPriceV1,
  type DaaStoreRebalanceCycleV1,
} from "@/src/daa/store/daaStorePgV1";
import { buildDaaUnifiedPlanV1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";
import {
  buildFxLookupToBaseV1,
  buildPositionValuationRowsV1,
} from "@/src/daa/modules/portfolio/portfolioValuationV1";
import { fetchYfinanceLatestCloseV1 } from "@/src/market/yfinanceFetchV1";
import { toYfinanceSymbolByMarketV1 } from "@/src/market/yfinanceSymbolV1";

import { buildAssetUniverseViewRowsV1 } from "./assetUniverseServiceV1";
import type {
  ExecuteRebalanceCycleResultV1,
  GenerateRebalanceCycleInputV1,
  GenerateRebalanceCycleResultV1,
  HfSignalSummaryV1,
  PreTradeRiskCheckItemV1,
  PreTradeRiskCheckV1,
  RebalanceCycleV1,
  RebalanceProposalV1,
  RebalanceTriggerSourceV1,
  UpdateRebalanceCycleInputV1,
  WorkbenchBootstrapV1,
  WorkbenchRecommendationV1,
  WorkbenchRecommendationsResultV1,
  WorkbenchTradeRecordsV1,
} from "./workbenchTypesV1";

const PRICE_SYNC_TIMEOUT_MS = 2600;
const PRICE_SYNC_CONCURRENCY = 4;
const PRICE_SYNC_MAX_TARGETS = 30;
const PRICE_STALE_SEC = 6 * 60 * 60;
const PRICE_REFRESH_FRESH_SKIP_SEC = 120;

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
    if (!(row.holdingQty > 0) || !(row.costBasis && row.costBasis > 0)) return worst;
    const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    if (!(price > 0)) return worst;
    const drawdownPct = ((row.costBasis - price) / row.costBasis) * 100;
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
    createdAt: cycle.createdAt,
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
  const holdingRows = input.rows.map((row) => ({
    symbol: row.symbol,
    market: row.market,
    currency: row.currency,
    qty: toPositive(row.holdingQty, 0),
    price: row.holdingPrice > 0 ? row.holdingPrice : row.lastPrice,
  }));
  const fxLookup = buildFxLookupToBaseV1(input.fxRates);
  const valuationRows = buildPositionValuationRowsV1(holdingRows, input.baseCurrency, fxLookup);
  const holdingsValue = valuationRows.reduce((sum, row) => sum + (row.baseValue ?? 0), 0);
  return holdingsValue + Math.max(0, toFinite(input.cash, 0));
}

async function withTimeoutV1<T>(job: Promise<T>, timeoutMs: number): Promise<T | null> {
  const timeout = Math.max(500, Math.trunc(timeoutMs));
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeout);

    job.then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
  });
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
} = {}): Promise<{ updated: number; attempted: number; skipped: number }> {
  const rows = await listDaaAssetUniverseV1();
  const maxTargets = Math.max(1, Math.min(100, Math.trunc(opts.maxTargets ?? PRICE_SYNC_MAX_TARGETS)));
  const timeoutMs = Math.max(600, Math.min(8000, Math.trunc(opts.timeoutMs ?? PRICE_SYNC_TIMEOUT_MS)));
  const concurrency = Math.max(1, Math.min(12, Math.trunc(opts.concurrency ?? PRICE_SYNC_CONCURRENCY)));

  const targets = rows.filter((row) => {
    const yfinanceSymbol = toYfinanceSymbolByMarketV1(row.symbol, row.market);
    if (!yfinanceSymbol) return false;
    if (!(row.lastPrice > 0)) return true;
    const ageSec = priceAgeSecV1(row.priceUpdatedAt);
    if (ageSec == null) return true;
    if (ageSec <= PRICE_REFRESH_FRESH_SKIP_SEC) return false;
    return ageSec >= PRICE_STALE_SEC;
  }).slice(0, maxTargets);

  if (!targets.length) {
    return { updated: 0, attempted: 0, skipped: rows.length };
  }

  let cursor = 0;
  let updated = 0;
  const historyRows: Array<{ symbol: string; price: number; ts: string; source: string }> = [];

  async function worker() {
    for (;;) {
      const current = targets[cursor];
      cursor += 1;
      if (!current) break;
      const yfinanceSymbol = toYfinanceSymbolByMarketV1(current.symbol, current.market);
      if (!yfinanceSymbol) continue;

      const latest = await withTimeoutV1(fetchYfinanceLatestCloseV1(yfinanceSymbol), timeoutMs);
      if (!latest || !(latest.price > 0)) continue;

      const saved = await updateDaaAssetUniverseLastPriceV1({
        assetKey: current.assetKey,
        lastPrice: latest.price,
        priceUpdatedAt: latest.ts,
      });
      if (!saved) continue;
      updated += 1;
      historyRows.push({
        symbol: yfinanceSymbol,
        price: latest.price,
        ts: latest.ts,
        source: "workbench_bootstrap",
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));

  if (historyRows.length > 0) {
    try {
      await appendPriceHistoryRowsV1(historyRows);
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

  const totalEquityRaw = toFinite(accountRaw.totalEquity, Number.NaN);
  const computedEquity = computeTotalEquityV1({
    rows: assetRows,
    fxRates,
    baseCurrency,
    cash,
  });
  const totalEquity = Number.isFinite(totalEquityRaw) && totalEquityRaw > 0 ? totalEquityRaw : computedEquity;
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
        price: row.holdingPrice > 0 ? row.holdingPrice : row.lastPrice,
        costBasis: row.costBasis ?? undefined,
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

export async function buildWorkbenchBootstrapV1(opts: {
  syncPrices?: boolean;
} = {}): Promise<WorkbenchBootstrapV1> {
  const shouldSyncPrices = opts.syncPrices !== false;

  if (shouldSyncPrices) {
    try {
      await syncWorkbenchPricesV1();
    } catch {
      // 行情同步失败不阻塞工作台加载
    }
  }

  const [systemRow, rows, fxRates, allTickets, hfSignalMap, rebalanceCycles] = await Promise.all([
    getDaaSystemConfigV2(),
    listDaaAssetUniverseV1(),
    listDaaFxRatesV1(),
    listDaaTradeTicketsV1({ limit: 500 }),
    buildHfSignalMapV1(),
    listDaaRebalanceCyclesV1(100),
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

  const targetWeights = buildTargetWeightsFromConfigV1({
    targetWeightsRaw: (strategy.targetWeights || {}) as Record<string, unknown>,
    assetRows: rows.map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      watchEnabled: row.watchEnabled,
      targetWeightHint: row.targetWeightHint,
    })),
  });

  const assetUniverseRaw = buildAssetUniverseViewRowsV1({
    rows,
    fxRates,
    baseCurrency,
    cash,
    targetWeights,
  });
  const assetUniverse = assetUniverseRaw.map((row) => ({
    ...row,
    hfSignal: hfSignalMap.get(row.symbol) || null,
  }));

  const totalEquityRaw = toFinite(accountRaw.totalEquity, Number.NaN);
  const totalEquity = Number.isFinite(totalEquityRaw) && totalEquityRaw > 0
    ? totalEquityRaw
    : computeTotalEquityV1({
      rows,
      fxRates,
      baseCurrency,
      cash,
    });

  const logs = allTickets
    .filter((ticket) => ticket.status !== "ready")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 200);

  const warnings: string[] = [];
  const fxMissingCount = assetUniverse.filter((row) => row.fxMissing).length;
  if (fxMissingCount > 0) {
    warnings.push(`存在 ${fxMissingCount} 个资产缺少汇率，权重和估值已按可用数据计算。`);
  }

  const staleCount = assetUniverse.filter((row) => row.priceStatus === "stale").length;
  const missingCount = assetUniverse.filter((row) => row.priceStatus === "missing").length;
  if (staleCount > 0) {
    warnings.push(`存在 ${staleCount} 个资产价格超过 ${Math.floor(PRICE_STALE_SEC / 3600)} 小时。`);
  }
  if (missingCount > 0) {
    warnings.push(`存在 ${missingCount} 个资产暂时无可用价格，相关标的暂不可执行市价单。`);
  }

  const rebalanceStrategy = systemRow.config.rebalanceStrategy;
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
    warnings,
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

  return buildPreTradeRiskCheckV1({
    assetUniverse: bootstrap.assetUniverse,
    proposals,
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
  const now = new Date();
  const skipWithLatest = (message: string, options: {
    skippedByCooldown?: boolean;
    cooldownUntil?: string | null;
    attachLatestCycle?: boolean;
  } = {}): GenerateRebalanceCycleResultV1 => ({
    cycle: options.attachLatestCycle ? mapStoreCycleToViewV1(latestCycle) : null,
    created: false,
    skippedByCooldown: options.skippedByCooldown === true,
    cooldownUntil: options.cooldownUntil || null,
    message,
  });

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
  if (!manual && latestCycle) {
    const lastMs = Date.parse(latestCycle.createdAt || latestCycle.snapshotAt);
    if (Number.isFinite(lastMs) && lastMs + cooldownMs > Date.now()) {
      return skipWithLatest(
        `冷静期生效中，${cooldownHours} 小时内不重复自动触发`,
        { skippedByCooldown: true, cooldownUntil: toIsoByMs(lastMs + cooldownMs), attachLatestCycle: true },
      );
    }
  }

  const draft = buildCycleDraftFromBootstrapV1({
    bootstrap,
    triggerReason: input.triggerReason,
  });

  if (!manual && triggerSource === "drift") {
    const thresholdPct = Math.max(0, strategy.drift.thresholdPct * 100);
    if (!(draft.maxAbsDriftPct > thresholdPct)) {
      return skipWithLatest(
        `最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}% 未超过阈值 ${thresholdPct.toFixed(2)}%`,
      );
    }
  }

  const riskCheck = await runWorkbenchRiskCheckV1({
    selectedSymbols: draft.proposals.map((row) => row.symbol),
  });

  const created = await createDaaRebalanceCycleV1({
    triggerSource,
    triggerReason: draft.triggerReason,
    snapshotAt: new Date().toISOString(),
    equitySnapshot: Math.max(0, toFinite(bootstrap.account.totalEquity, 0)),
    driftSnapshot: draft.driftSnapshot,
    proposals: draft.proposals,
    riskCheck,
  });

  return {
    cycle: mapStoreCycleToViewV1(created),
    created: true,
    skippedByCooldown: false,
    cooldownUntil: null,
    message: `已生成再平衡周期 ${created.cycleId}`,
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

export async function updateWorkbenchRebalanceCycleV1(
  cycleId: string,
  input: UpdateRebalanceCycleInputV1,
): Promise<RebalanceCycleV1> {
  const current = await getDaaRebalanceCycleV1(cycleId);
  if (!current) throw new Error(`cycle not found: ${cycleId}`);

  let proposals = current.proposals;
  if (Array.isArray(input.selectedSymbols)) {
    const selectedSet = new Set(input.selectedSymbols.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean));
    proposals = proposals.map((row) => ({
      ...row,
      selected: selectedSet.has(row.symbol.toUpperCase()),
    }));
  }

  const patchInput: Parameters<typeof patchDaaRebalanceCycleV1>[0] = {
    cycleId,
    proposals,
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
  if (cycle.status === "cancelled") throw new Error("cycle already cancelled");
  if (cycle.status === "completed") throw new Error("cycle already completed");

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

  const [preTradeRiskCheck, systemRow] = await Promise.all([
    runWorkbenchRiskCheckV1({
      cycleId: input.cycleId,
      selectedSymbols: toExecute.map((row) => row.symbol),
    }),
    getDaaSystemConfigV2(),
  ]);
  const enforceOnExecution = systemRow.config.strategy.risk.enforceOnExecution !== false;
  const feeRateBps = Math.max(0, toFinite(systemRow.config.strategy.constraints.tradeFeeRateBps, 0));
  const feeRate = feeRateBps / 10000;
  if (enforceOnExecution && preTradeRiskCheck.overallStatus === "block") {
    await patchDaaRebalanceCycleV1({
      cycleId: input.cycleId,
      status: "reviewing",
      riskCheck: preTradeRiskCheck,
    });
    const blockedItem = preTradeRiskCheck.items.find((item) => item.status === "block");
    throw new Error(`RISK_BLOCKED:${blockedItem?.message || "执行前风控阻断"}`);
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

  const logs = await listDaaTradeTicketsV1({ limit: 300 });
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
