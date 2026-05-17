import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { toFinite, toPositive } from "@/src/daa/utils/normalize";
import { resolveInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import type { DaaMarketContext } from "@/src/daa/modules/marketContext/marketContextTypes";
import { getCurrentMarketContext } from "@/src/daa/modules/marketContext/marketIndicatorService";
import {
  appendAssetPriceHistoryRows,
  createDaaRebalanceCycle,
  getDaaAccountState,
  getDaaLedgerStartTs,
  getDaaSystemConfig,
  getDaaMarketCacheHealthStats,
  listDaaAssetUniverse,
  listDaaCycleReports,
  listDaaFxRates,
  listDaaRebalanceCycles,
  listDaaTradeTickets,
  updateDaaAssetUniverseLastPrice,
  type DaaStoreAssetUniverseRow,
} from "@/src/daa/store/daaStorePg";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";

import { buildAssetUniverseViewRows } from "./assetUniverseService";
import {
  buildFxLookupToBase,
  summarizeMarkToMarketPortfolio,
} from "@/src/daa/modules/portfolio/portfolioValuation";
import type {
  RebalanceCycle,
  WorkbenchBootstrap,
  WorkbenchAccountBreakdownItem,
  WorkbenchRebalanceCycleReport,
  WorkbenchTradeRecords,
} from "./workbenchTypes";

import {
  buildHfSignalMap,
  buildPreTradeRiskCheck,
  buildRiskCycleDraft,
  buildWorkbenchMarketDataHealth,
  mapStoreCycleReportToView,
  mapStoreCycleToView,
  priceAgeSec,
} from "./workbenchModeling";
import { appendTriggerEventSafe } from "./triggerEvent";

const PRICE_SYNC_TIMEOUT_MS = 2600;
const PRICE_SYNC_CONCURRENCY = 4;
const PRICE_SYNC_MAX_TARGETS = 30;
const PRICE_STALE_SEC = 6 * 60 * 60;
const PRICE_REFRESH_FRESH_SKIP_SEC = 120;

type WorkbenchRuntimeAccountState = {
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
  cashMutationsAllowed: boolean;
  readOnlyReason: string | null;
  accountBreakdown: WorkbenchAccountBreakdownItem[];
};

type WorkbenchRuntimePortfolioSnapshot = {
  baseCurrency: string;
  account: WorkbenchRuntimeAccountState;
  assetRows: DaaStoreAssetUniverseRow[];
  warnings: string[];
};

type WorkbenchBootstrapOptions = {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
  forceRefreshAllPrices?: boolean;
  maxSyncTargets?: number;
};

type WorkbenchBootstrapBundle = {
  bootstrap: WorkbenchBootstrap;
  cycles: RebalanceCycle[];
};

function buildScopedMarketCacheStats(input: {
  globalStats: Awaited<ReturnType<typeof getDaaMarketCacheHealthStats>>;
  assetUniverse: ReturnType<typeof buildAssetUniverseViewRows>;
}): Awaited<ReturnType<typeof getDaaMarketCacheHealthStats>> {
  const freshCount = input.assetUniverse.filter((row) => row.priceStatus === "fresh").length;
  const staleCount = input.assetUniverse.filter((row) => row.priceStatus === "stale").length;
  const missingCount = input.assetUniverse.filter((row) => row.priceStatus === "missing" || row.priceStatus === "unsupported").length;

  return {
    ...input.globalStats,
    totalSnapshots: input.assetUniverse.length,
    freshCount,
    staleCount,
    missingCount,
  };
}

function isWithinCurrentLedger(ts: string | null | undefined, ledgerStartTs: string | null): boolean {
  if (!ledgerStartTs) return true;
  if (!ts) return false;
  return Date.parse(ts) >= Date.parse(ledgerStartTs);
}

async function loadRuntimePortfolioSnapshot(): Promise<WorkbenchRuntimePortfolioSnapshot> {
  const [localAccountState, assetRows] = await Promise.all([
    getDaaAccountState(),
    listDaaAssetUniverse(),
  ]);
  const baseCurrency = normalizeDaaCurrencyCode(localAccountState.baseCurrency, "USD");
  const cash = toPositive(localAccountState.cash, 0);
  const frozenCash = toPositive(localAccountState.frozenCash, 0);
  const investableCash = resolveInvestableCash({
    cash,
    frozenCash,
    investableCash: localAccountState.investableCash,
  });

  return {
    baseCurrency,
    account: {
      baseCurrency,
      cash,
      investableCash,
      frozenCash,
      totalEquity: localAccountState.totalEquity == null ? null : toPositive(localAccountState.totalEquity, 0),
      cashMutationsAllowed: true,
      readOnlyReason: null,
      accountBreakdown: [{
        venueKind: "sim",
        accountId: "local",
        label: "本地模拟 / Crypto Paper",
        baseCurrency,
        cash,
        investableCash,
        frozenCash,
        totalEquity: localAccountState.totalEquity == null ? null : toPositive(localAccountState.totalEquity, 0),
        cashMutationsAllowed: true,
        readOnlyReason: null,
      }],
    },
    assetRows,
    warnings: [],
  };
}

async function syncWorkbenchPrices(opts: {
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
    } catch (err) {
      logSwallowed("workbenchReadService.attachPriceHistory", err);
    }
  }

  return {
    updated,
    attempted: targets.length,
    skipped: Math.max(0, rows.length - targets.length),
  };
}

export async function buildWorkbenchBootstrapBundle(opts: WorkbenchBootstrapOptions = {}): Promise<WorkbenchBootstrapBundle> {
  const shouldSyncPrices = opts.syncPrices !== false;
  const shouldAutoRiskCycle = opts.autoRiskCycle === true;
  const runtimePortfolio = await loadRuntimePortfolioSnapshot();

  const dataQualityWarnings: string[] = [];
  if (shouldSyncPrices) {
    try {
      await syncWorkbenchPrices({
        forceRefreshAll: opts.forceRefreshAllPrices === true,
        maxTargets: opts.maxSyncTargets,
      });
    } catch (err) {
      logSwallowed("workbenchReadService.syncMarketData", err);
      dataQualityWarnings.push("实时行情同步失败，当前展示的价格可能为缓存数据。");
    }
  }

  const [systemRow, fxRates, allTicketsRaw, hfSignalMap, rebalanceCyclesRaw, marketCacheStats, ledgerStartTs] = await Promise.all([
    getDaaSystemConfig(),
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
  const baseCurrency = normalizeDaaCurrencyCode(runtimePortfolio.baseCurrency, "USD");
  const cash = runtimePortfolio.account.cash;
  const frozenCash = runtimePortfolio.account.frozenCash;
  const investableCash = runtimePortfolio.account.investableCash;
  const rows = runtimePortfolio.assetRows;

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
  } catch (err) {
    logSwallowed("workbenchReadService.readMarketCache", err);
    marketCacheReadFailed = true;
    priceContextByKey = {};
    dataQualityWarnings.push("市场价格缓存读取异常，已回退到库内快照价格。");
  }

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

  const portfolioValuation = summarizeMarkToMarketPortfolio({
    positions: rowsWithPriceContext.map((row) => ({
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
      qty: row.holdingQty,
      holdingPrice: row.holdingPrice,
      lastPrice: row.lastPrice,
    })),
    baseCurrency,
    cash,
    fxLookup: buildFxLookupToBase(fxRates),
    accountTotalEquity: runtimePortfolio.account.totalEquity,
  });
  const totalEquity = portfolioValuation.totalEquity;

  const logs = allTickets
    .filter((ticket) => ticket.status !== "ready")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 200);

  const warnings: string[] = [...runtimePortfolio.warnings, ...dataQualityWarnings];
  const scopedMarketCacheStats = marketCacheReadFailed
    ? marketCacheStats
    : buildScopedMarketCacheStats({
      globalStats: marketCacheStats,
      assetUniverse,
    });
  const marketDataHealth = buildWorkbenchMarketDataHealth({
    cacheReadFailed: marketCacheReadFailed,
    stats: scopedMarketCacheStats,
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
    const missingSymbols = assetUniverse.filter((row) => row.priceStatus === "missing").map((row) => row.symbol).slice(0, 8);
    warnings.push(`${missingCount} 个资产暂无价格（${missingSymbols.join("、")}），暂不可执行市价单。`);
  }

  let marketContext: DaaMarketContext | null = null;
  try {
    marketContext = await getCurrentMarketContext({ allowStale: true });
  } catch (err) {
    logSwallowed("workbenchReadService.getMarketContext", err);
    marketContext = null;
    dataQualityWarnings.push("市场环境数据获取失败，当前决策未包含市场环境因子。");
  }

  const policy = resolvePolicyConfig(systemRow.config);
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
        execution: {
          logs: [],
          feeRateBps: systemRow.config.strategy.execution?.feeRateBps ?? 0,
          slippageBps: systemRow.config.strategy.execution?.slippageBps ?? 0,
          minNotional: systemRow.config.strategy.constraints.minNotional ?? 0,
        },
        rebalance: {
          mode: policy.execution.autoGenerateEnabled ? "auto" : "manual",
          autoGenerateEnabled: policy.execution.autoGenerateEnabled,
          scheduledTimeUtc: policy.review.scheduledTimeUtc,
          timezone: policy.review.timezone,
        },
        policy,
        latestCycle: null,
        marketContext,
        warnings: [],
        marketDataHealth,
      },
      perAssetStopLossPct: systemRow.config.strategy.risk.perAssetStopLossPct,
      perAssetTakeProfitPct: systemRow.config.strategy.risk.perAssetTakeProfitPct,
    });
    if (riskDraft) {
      const cooldownMs = Math.max(1, policy.throttle.autoExecutionCooldownHours) * 60 * 60 * 1000;
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
        } catch (err) {
          logSwallowed("workbenchReadService.riskTriggerWrite", err);
          dataQualityWarnings.push("风控触发周期写入失败，已检测到止损/止盈信号但未能生成周期。");
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
  const cycles = rebalanceCycles
    .map((row) => mapStoreCycleToView(row))
    .filter(Boolean) as RebalanceCycle[];
  const latestCycle = cycles[0] || null;

  return {
    bootstrap: {
      baseCurrency,
      account: {
        cash,
        investableCash,
        frozenCash,
        totalEquity,
        valuation: {
          holdingsValue: portfolioValuation.holdingsValue,
          derivedTotalEquity: portfolioValuation.derivedTotalEquity,
          totalEquity: portfolioValuation.totalEquity,
          equitySource: portfolioValuation.equitySource,
          fxMissingAssetKeys: portfolioValuation.fxMissingAssets.map((row) => row.assetKey),
        },
        cashMutationsAllowed: runtimePortfolio.account.cashMutationsAllowed,
        readOnlyReason: runtimePortfolio.account.readOnlyReason,
        accountBreakdown: runtimePortfolio.account.accountBreakdown,
      },
      assetUniverse,
      execution: {
        logs,
        feeRateBps: strategy.execution?.feeRateBps ?? 0,
        slippageBps: strategy.execution?.slippageBps ?? 0,
        minNotional: strategy.constraints.minNotional ?? 0,
      },
      rebalance: {
        mode: policy.execution.autoGenerateEnabled ? "auto" : "manual",
        autoGenerateEnabled: policy.execution.autoGenerateEnabled,
        scheduledTimeUtc: policy.review.scheduledTimeUtc,
        timezone: policy.review.timezone,
      },
      policy,
      latestCycle,
      marketContext,
      warnings,
      marketDataHealth,
    },
    cycles,
  };
}

export async function buildWorkbenchBootstrap(opts: WorkbenchBootstrapOptions = {}): Promise<WorkbenchBootstrap> {
  const result = await buildWorkbenchBootstrapBundle(opts);
  return result.bootstrap;
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
