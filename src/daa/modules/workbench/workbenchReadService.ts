import { normalizeDaaCurrencyCode, normalizeDaaSymbol, parseDaaAssetKey } from "@/src/daa/assetKey";
import { resolveInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import type { DaaMarketContext, DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";
import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import { runLlmAnalysis } from "@/src/daa/llm/llmAnalysis";
import { runLlmDecision } from "@/src/daa/llm/llmDecision";
import { DEFAULT_ANALYSIS_FOCUS_ } from "@/src/daa/llm/analysisFocusDefaults";
import { hydrateUnifiedRequestWithSignals } from "@/src/daa/modules/decision/hydrateUnifiedRequest";
import type { UnifiedDecisionResult } from "@/src/daa/modules/decision/decisionResultTypes";
import {
  buildMarketContextAttribution,
  getCurrentMarketContext,
} from "@/src/daa/modules/marketContext/marketIndicatorService";
import { classifyCash } from "./cashClassification";
import { fuseDecision } from "./decisionFusion";
import {
  appendDaaTriggerEvent,
  appendDaaRunHistory,
  appendAssetPriceHistoryRows,
  createDaaRebalanceCycle,
  createDaaRebalanceDecision,
  createDaaTradeTicket,
  executeDaaTradeTickets,
  getDaaAccountState,
  getDaaCycleReport,
  getDaaLedgerStartTs,
  getDaaHumanIngestState,
  getDaaRebalanceCycle,
  getDaaSystemConfig,
  getDaaMarketCacheHealthStats,
  listDaaAssetUniverse,
  listDaaCycleReports,
  listDaaEquitySnapshots,
  listDaaFxRates,
  listDaaRebalanceCycles,
  listDaaTradeTickets,
  patchDaaRebalanceCycle,
  upsertDaaCycleReport,
  updateDaaAssetUniverseLastPrice,
  type DaaStoreRebalanceCycle,
} from "@/src/daa/store/daaStorePg";
import { buildDaaUnifiedPlan, type DaaUnifiedRequest } from "@/src/daa/unifiedRebalance";
import {
  buildFxLookupToBase,
  summarizeMarkToMarketPortfolio,
} from "@/src/daa/modules/portfolio/portfolioValuation";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";

import { buildAssetUniverseViewRows } from "./assetUniverseService";
import type {
  ExecuteRebalanceSummary,
  ExecuteRebalanceCycleResult,
  GenerateRebalanceCycleInput,
  GenerateRebalanceCycleResult,
  HfSignalSummary,
  PortfolioHealthyInsight,
  PreTradeRiskCheckItem,
  PreTradeRiskCheck,
  RebalanceCycle,
  RebalanceProposal,
  RebalanceTriggerSource,
  UpdateRebalanceCycleInput,
  WorkbenchBootstrap,
  WorkbenchRebalanceCycleReport,
  WorkbenchRecommendation,
  WorkbenchRecommendationsResult,
  WorkbenchTradeRecords,
} from "./workbenchTypes";

import {
  appendTriggerEventSafe,
  buildHfSignalMap,
  buildMarketFacts,
  buildPreTradeRiskCheck,
  buildRiskCycleDraft,
  buildTargetWeightsFromConfig,
  buildWorkbenchMarketDataHealth,
  calcHoldingCostPerUnit,
  computeTotalEquity,
  mapStoreCycleReportToView,
  mapStoreCycleToView,
  normalizeText,
  pickCycleMarketRegimes,
  priceAgeSec,
  toFinite,
  toPositive,
} from "./workbenchShared";

const PRICE_SYNC_TIMEOUT_MS = 2600;
const PRICE_SYNC_CONCURRENCY = 4;
const PRICE_SYNC_MAX_TARGETS = 30;
const PRICE_STALE_SEC = 6 * 60 * 60;
const PRICE_REFRESH_FRESH_SKIP_SEC = 120;

function isWithinCurrentLedger(ts: string | null | undefined, ledgerStartTs: string | null): boolean {
  if (!ledgerStartTs) return true;
  if (!ts) return false;
  return Date.parse(ts) >= Date.parse(ledgerStartTs);
}

export async function syncWorkbenchPrices(opts: {
  maxTargets?: number;
  timeoutMs?: number;
  concurrency?: number;
  forceRefreshAll?: boolean;
} = {}): Promise<{ updated: number; attempted: number; skipped: number }> {
  const [rows, system] = await Promise.all([
    listDaaAssetUniverse(),
    getDaaSystemConfig(),
  ]);
  const forceRefreshAll = opts.forceRefreshAll === true;
  const defaultMaxTargets = forceRefreshAll ? rows.length : PRICE_SYNC_MAX_TARGETS;
  const maxTargets = Math.max(1, Math.min(100, Math.trunc(opts.maxTargets ?? defaultMaxTargets)));
  const timeoutMs = Math.max(600, Math.min(8000, Math.trunc(opts.timeoutMs ?? PRICE_SYNC_TIMEOUT_MS)));
  const concurrency = Math.max(1, Math.min(12, Math.trunc(opts.concurrency ?? PRICE_SYNC_CONCURRENCY)));
  const priceFeedEnabled = system.config.dataSources.priceFeed.enabled !== false;
  const marketCache = system.config.dataSources.priceFeed.marketCache;

  if (!priceFeedEnabled) {
    return { updated: 0, attempted: 0, skipped: rows.length };
  }

  const targets = (forceRefreshAll
    ? rows
    : rows.filter((row) => {
      if (!(row.lastPrice > 0)) return true;
      const ageSec = priceAgeSec(row.priceUpdatedAt);
      if (ageSec == null) return true;
      if (ageSec <= PRICE_REFRESH_FRESH_SKIP_SEC) return false;
      return ageSec >= PRICE_STALE_SEC;
    })
  ).slice(0, maxTargets);

  if (!targets.length) {
    return { updated: 0, attempted: 0, skipped: rows.length };
  }

  const priced = await getMarketPricesWithCache({
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
    const saved = await updateDaaAssetUniverseLastPrice({
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
      await appendAssetPriceHistoryRows(historyRows);
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

export async function buildUnifiedRequestFromStore(): Promise<{
  request: DaaUnifiedRequest;
  baseCurrency: string;
  assetRows: Awaited<ReturnType<typeof listDaaAssetUniverse>>;
}> {
  const [systemRow, assetRows, fxRates, snapshots] = await Promise.all([
    getDaaSystemConfig(),
    listDaaAssetUniverse(),
    listDaaFxRates(),
    listDaaEquitySnapshots(365),
  ]);

  const strategy = systemRow.config.strategy;
  const accountRaw = strategy.account || {};
  const baseCurrency = normalizeDaaCurrencyCode(accountRaw.baseCurrency, "USD");
  const cash = toPositive(accountRaw.cash, 0);
  const frozenCash = toPositive(accountRaw.frozenCash, 0);
  const investableCash = resolveInvestableCash({
    cash,
    frozenCash,
    investableCash: accountRaw.investableCash,
  });

  const totalEquity = computeTotalEquity({
    rows: assetRows,
    fxRates,
    baseCurrency,
    cash,
  });
  const equityPeakFromSnapshots = snapshots.reduce((max, row) => Math.max(max, toPositive(row.totalEquity, 0)), 0);
  const equityPeak = Math.max(totalEquity, equityPeakFromSnapshots);

  const targetWeights = buildTargetWeightsFromConfig({
    targetWeightsRaw: (strategy.targetWeights || {}) as Record<string, unknown>,
    assetRows: assetRows.map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      watchEnabled: row.watchEnabled,
      targetWeightHint: row.targetWeightHint,
    })),
  });

  const request: DaaUnifiedRequest = {
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
        costBasisPerUnit: calcHoldingCostPerUnit(row) ?? undefined,
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

export async function buildWorkbenchBootstrap(opts: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
  forceRefreshAllPrices?: boolean;
  maxSyncTargets?: number;
} = {}): Promise<WorkbenchBootstrap> {
  const shouldSyncPrices = opts.syncPrices !== false;
  const shouldAutoRiskCycle = opts.autoRiskCycle === true;

  if (shouldSyncPrices) {
    try {
      await syncWorkbenchPrices({
        forceRefreshAll: opts.forceRefreshAllPrices === true,
        maxTargets: opts.maxSyncTargets,
      });
    } catch {
      // 行情同步失败不阻塞工作台加载
    }
  }

  const [systemRow, accountState, rows, fxRates, allTicketsRaw, hfSignalMap, rebalanceCyclesRaw, marketCacheStats, ledgerStartTs] = await Promise.all([
    getDaaSystemConfig(),
    getDaaAccountState(),
    listDaaAssetUniverse(),
    listDaaFxRates(),
    listDaaTradeTickets({ limit: 500 }),
    buildHfSignalMap(),
    listDaaRebalanceCycles(100),
    getDaaMarketCacheHealthStats(),
    getDaaLedgerStartTs(),
  ]);
  let rebalanceCycles = rebalanceCyclesRaw.filter((row) => isWithinCurrentLedger(row.createdAt, ledgerStartTs));
  const allTickets = allTicketsRaw.filter((row) => isWithinCurrentLedger(row.createdAt, ledgerStartTs));

  const strategy = systemRow.config.strategy;
  const baseCurrency = normalizeDaaCurrencyCode(accountState.baseCurrency, "USD");
  const cash = toPositive(accountState.cash, 0);
  const frozenCash = toPositive(accountState.frozenCash, 0);
  const investableCash = resolveInvestableCash({
    cash,
    frozenCash,
    investableCash: accountState.investableCash,
  });

  const marketCache = systemRow.config.dataSources.priceFeed.marketCache;
  let priceContextByKey: Record<string, Awaited<ReturnType<typeof getMarketPricesWithCache>>[string]> = {};
  let marketCacheReadFailed = false;
  try {
    priceContextByKey = await getMarketPricesWithCache({
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

  const targetWeights = buildTargetWeightsFromConfig({
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

  const assetUniverseBase = buildAssetUniverseViewRows({
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
  const totalEquity = accountState.totalEquity == null
    ? holdingsValue + cash
    : toPositive(accountState.totalEquity, holdingsValue + cash);

  const logs = allTickets
    .filter((ticket) => ticket.status !== "ready")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 200);

  const warnings: string[] = [];
  const marketDataHealth = buildWorkbenchMarketDataHealth({
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

  let marketContext: DaaMarketContext | null = null;
  try {
    marketContext = await getCurrentMarketContext({ allowStale: true });
  } catch {
    marketContext = null;
  }

  const rebalanceStrategy = systemRow.config.rebalanceStrategy;
  if (shouldAutoRiskCycle) {
    const riskDraft = buildRiskCycleDraft({
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

          analysisFocus: rebalanceStrategy.analysisFocus,
        },
        rebalanceStrategy,
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
        const riskCheck = buildPreTradeRiskCheck({
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
          const createdRiskCycle = await createDaaRebalanceCycle({
            triggerSource: "risk",
            triggerReason: riskDraft.triggerReason,
            snapshotAt: new Date().toISOString(),
            equitySnapshot: Math.max(0, toFinite(totalEquity, 0)),
            driftSnapshot: riskDraft.driftSnapshot,
            proposals: riskDraft.proposals,
            riskCheck,
            marketContext,
          });
          await appendTriggerEventSafe({
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
        await appendTriggerEventSafe({
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
  const latestCycle = mapStoreCycleToView(rebalanceCycles[0] || null);

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
    },
    latestCycle,
    marketContext,
    warnings,
    marketDataHealth,
  };
}

export async function listWorkbenchRebalanceCycles(limit = 120): Promise<RebalanceCycle[]> {
  const [cycles, ledgerStartTs] = await Promise.all([
    listDaaRebalanceCycles(limit),
    getDaaLedgerStartTs(),
  ]);
  return cycles
    .filter((row) => isWithinCurrentLedger(row.createdAt, ledgerStartTs))
    .map((row) => mapStoreCycleToView(row))
    .filter(Boolean) as RebalanceCycle[];
}

export async function listWorkbenchTradeRecords(limit = 120): Promise<WorkbenchTradeRecords> {
  const [cycles, orders, ledgerStartTs] = await Promise.all([
    listDaaRebalanceCycles(limit),
    listDaaTradeTickets({ limit: Math.max(200, limit * 2) }),
    getDaaLedgerStartTs(),
  ]);
  return {
    cycles: cycles.filter((row) => isWithinCurrentLedger(row.createdAt, ledgerStartTs)).map((row) => mapStoreCycleToView(row)!).filter(Boolean),
    orders: orders.filter((row) => isWithinCurrentLedger(row.createdAt, ledgerStartTs)),
  };
}

export async function listWorkbenchRebalanceReports(limit = 50): Promise<WorkbenchRebalanceCycleReport[]> {
  const [reports, ledgerStartTs] = await Promise.all([
    listDaaCycleReports(limit),
    getDaaLedgerStartTs(),
  ]);
  return reports
    .filter((item) => isWithinCurrentLedger(item.cycleCreatedAt, ledgerStartTs))
    .map((item) => mapStoreCycleReportToView(item))
    .filter(Boolean) as WorkbenchRebalanceCycleReport[];
}

export async function getWorkbenchRebalanceCycleReport(cycleId: string): Promise<WorkbenchRebalanceCycleReport | null> {
  const report = await getDaaCycleReport(cycleId);
  return mapStoreCycleReportToView(report);
}
