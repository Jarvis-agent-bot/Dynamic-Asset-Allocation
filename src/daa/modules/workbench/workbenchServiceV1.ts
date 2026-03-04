import { normalizeDaaCurrencyCodeV1, normalizeDaaSymbolV1, parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";
import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import type { UnifiedDecisionResultV2 } from "@/src/daa/modules/decision/decisionResultTypesV2";
import {
  appendDaaRunHistoryV1,
  appendPriceHistoryRowsV1,
  createDaaRebalanceDecisionV1,
  getActiveDaaTradeBasketV1,
  getDaaSystemConfigV2,
  listDaaAssetUniverseV1,
  listDaaEquitySnapshotsV1,
  listDaaFxRatesV1,
  listDaaTradeTicketsV1,
  updateDaaAssetUniverseLastPriceV1,
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
  WorkbenchBootstrapV1,
  WorkbenchRecommendationV1,
  WorkbenchRecommendationsResultV1,
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

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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

function buildTargetWeightsFromConfigV1(input: {
  targetWeightsRaw: Record<string, unknown>;
  assetRows: Array<{ assetKey: string; symbol: string; watchEnabled: boolean; targetWeightHint: number }>;
}): Record<string, number> {
  const out: Record<string, number> = {};
  const watchRows = input.assetRows.filter((row) => row.watchEnabled);

  const keysBySymbol = new Map<string, Array<{ assetKey: string; hint: number }>>();
  for (const row of watchRows) {
    const symbol = normalizeDaaSymbolV1(row.symbol);
    if (!symbol || !row.assetKey) continue;
    const list = keysBySymbol.get(symbol) ?? [];
    list.push({ assetKey: row.assetKey, hint: toPositive(row.targetWeightHint, 0) });
    keysBySymbol.set(symbol, list);
  }

  for (const [rawKey, rawValue] of Object.entries(input.targetWeightsRaw || {})) {
    const weight = toPositive(rawValue, 0);
    if (weight <= 0) continue;
    const keyText = normalizeText(rawKey).toUpperCase();
    if (!keyText) continue;

    const parsedAssetKey = parseDaaAssetKeyV1(keyText);
    if (parsedAssetKey) {
      out[keyText] = (out[keyText] ?? 0) + weight;
      continue;
    }

    const symbol = normalizeDaaSymbolV1(keyText);
    const matches = keysBySymbol.get(symbol) ?? [];
    if (matches.length === 1) {
      out[matches[0].assetKey] = (out[matches[0].assetKey] ?? 0) + weight;
      continue;
    }
    if (matches.length > 1) {
      const hinted = matches.filter((item) => item.hint > 0);
      const hintedSum = hinted.reduce((sum, item) => sum + item.hint, 0);
      if (hintedSum > 0) {
        for (const item of hinted) {
          const allocated = weight * (item.hint / hintedSum);
          if (allocated <= 0) continue;
          out[item.assetKey] = (out[item.assetKey] ?? 0) + allocated;
        }
        continue;
      }
    }

    out[symbol] = (out[symbol] ?? 0) + weight;
  }

  for (const row of watchRows) {
    if (!(row.targetWeightHint > 0)) continue;
    if (out[row.assetKey] == null) {
      out[row.assetKey] = row.targetWeightHint;
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

  const [systemRow, rows, fxRates, activeBasket, allTickets] = await Promise.all([
    getDaaSystemConfigV2(),
    listDaaAssetUniverseV1(),
    listDaaFxRatesV1(),
    getActiveDaaTradeBasketV1(),
    listDaaTradeTicketsV1({ limit: 500 }),
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

  const assetUniverse = buildAssetUniverseViewRowsV1({
    rows,
    fxRates,
    baseCurrency,
    cash,
    targetWeights,
  });

  const totalEquityRaw = toFinite(accountRaw.totalEquity, Number.NaN);
  const totalEquity = Number.isFinite(totalEquityRaw) && totalEquityRaw > 0
    ? totalEquityRaw
    : computeTotalEquityV1({
      rows,
      fxRates,
      baseCurrency,
      cash,
    });

  const queueItems = activeBasket
    ? allTickets.filter((ticket) => ticket.basketId === activeBasket.basketId && ticket.status === "ready")
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    : [];

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
      queueId: activeBasket?.basketId || null,
      queueStatus: activeBasket?.status || null,
      queueSource: activeBasket?.source || null,
      queueItems,
      logs,
    },
    warnings,
  };
}

export async function runWorkbenchRecommendationsV1(input: {
  analysisFocus?: string;
}): Promise<WorkbenchRecommendationsResultV1> {
  const analysisFocus = normalizeText(input.analysisFocus) || DEFAULT_ANALYSIS_FOCUS_V1;
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
    triggerSource: "manual",
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
      triggerSource: "manual",
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

export async function runWorkbenchDecisionV1(input: {
  analysisFocus?: string;
}): Promise<WorkbenchRecommendationsResultV1> {
  return runWorkbenchRecommendationsV1(input);
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

export function normalizeReceiptFiltersV1(input: {
  status?: unknown;
  source?: unknown;
  limit?: unknown;
}): { status?: "ready" | "executed" | "canceled" | "rejected"; source?: "manual" | "decision"; limit: number } {
  return normalizeExecutionLogFiltersV1(input);
}

export function normalizeBasketSourceV1(value: unknown): "manual" | "decision" | "mixed" | "migration" {
  const source = normalizeText(value).toLowerCase();
  if (source === "decision") return "decision";
  if (source === "mixed") return "mixed";
  if (source === "migration") return "migration";
  return "manual";
}

export function normalizeTradeSideV1(value: unknown): "BUY" | "SELL" | null {
  const side = normalizeText(value).toUpperCase();
  if (side === "BUY" || side === "SELL") return side;
  return null;
}

export function normalizeReasonTagsV1(value: unknown): string[] {
  return pickArray(value).map((item) => item.toLowerCase());
}

export function normalizeManualFlagsV1(value: unknown): boolean {
  return pickBoolean(value, false);
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
