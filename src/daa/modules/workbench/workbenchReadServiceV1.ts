import { normalizeDaaCurrencyCodeV1, normalizeDaaSymbolV1, parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import { resolveInvestableCashV1 } from "@/src/daa/account/resolveInvestableCashV1";
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

import {
  appendTriggerEventSafeV1,
  buildHfSignalMapV1,
  buildMarketFactsV1,
  buildPreTradeRiskCheckV1,
  buildRiskCycleDraftV1,
  buildTargetWeightsFromConfigV1,
  buildWorkbenchMarketDataHealthV1,
  calcHoldingCostPerUnitV1,
  computeTotalEquityV1,
  mapStoreCycleReportToViewV1,
  mapStoreCycleToViewV1,
  nextCalendarDueDateV1,
  normalizeText,
  pickCycleMarketRegimesV1,
  priceAgeSecV1,
  toFinite,
  toPositive,
} from "./workbenchSharedV1";

const PRICE_SYNC_TIMEOUT_MS = 2600;
const PRICE_SYNC_CONCURRENCY = 4;
const PRICE_SYNC_MAX_TARGETS = 30;
const PRICE_STALE_SEC = 6 * 60 * 60;
const PRICE_REFRESH_FRESH_SKIP_SEC = 120;

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
  const priceFeedEnabled = system.config.dataSources.priceFeed.enabled !== false;
  const marketCache = system.config.dataSources.priceFeed.marketCache;

  if (!priceFeedEnabled) {
    return { updated: 0, attempted: 0, skipped: rows.length };
  }

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
  const investableCash = resolveInvestableCashV1({
    cash,
    frozenCash,
    investableCash: accountRaw.investableCash,
  });

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
  const investableCash = resolveInvestableCashV1({
    cash,
    frozenCash,
    investableCash: accountRaw.investableCash,
  });

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

export async function listWorkbenchRebalanceCyclesV1(limit = 120): Promise<RebalanceCycleV1[]> {
  const cycles = await listDaaRebalanceCyclesV1(limit);
  return cycles.map((row) => mapStoreCycleToViewV1(row)).filter(Boolean) as RebalanceCycleV1[];
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
