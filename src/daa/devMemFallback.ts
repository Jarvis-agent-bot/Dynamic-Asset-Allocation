import {
  DEFAULT_SYSTEM_CONFIG_,
  getStrategyExecutionConfig,
  normalizeSystemConfig,
  type DaaSystemConfigEnvelope,
} from "@/src/daa/config/systemConfig";
import { isDaaPgMemRuntime } from "@/src/daa/pg/daaPg";
import { MARKET_INDICATOR_KEYS_ } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import type {
  DaaMarketIndicatorKey,
  DaaMarketIndicatorScope,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type {
  StrategyLabSeedReadModel,
  TradesReadModel,
  WorkbenchReadModel,
} from "@/src/daa/modules/read/readModels";
import type {
  RebalanceStrategyConfig,
  WorkbenchBootstrap,
} from "@/src/daa/modules/workbench/workbenchTypes";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizedDefaultConfig() {
  return normalizeSystemConfig(cloneJson(DEFAULT_SYSTEM_CONFIG_));
}

function buildRebalanceStrategyFallback(): RebalanceStrategyConfig {
  const config = normalizedDefaultConfig();
  return {
    calendar: { ...config.rebalanceStrategy.calendar },
    drift: { ...config.rebalanceStrategy.drift },
    cooldownHours: config.rebalanceStrategy.cooldownHours,
    analysisTimeUtc: config.rebalanceStrategy.analysisTimeUtc,
    timezone: config.rebalanceStrategy.timezone,
    analysisFocus: config.rebalanceStrategy.analysisFocus,
    autoGenerateEnabled: config.rebalanceStrategy.autoGenerateEnabled,
    ...(config.rebalanceStrategy.cash ? { cash: { ...config.rebalanceStrategy.cash } } : {}),
  };
}

function buildDevMemLedgerMeta() {
  return {
    ledgerStartTs: null,
    openingBalance: 0,
    archivedCycleCount: 0,
    archivedTradeCount: 0,
    archivedReportCount: 0,
  };
}

function buildDevMemNotificationStatusSummary() {
  return {
    cronConfigured: false,
    recentJobs: [],
    channels: {
      telegram: {
        channel: "telegram" as const,
        enabled: false,
        configured: false,
        secretStates: [],
        deliveryEvents: [],
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
      },
      feishu: {
        channel: "feishu" as const,
        enabled: false,
        configured: false,
        secretStates: [],
        deliveryEvents: [],
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
      },
    },
  };
}

export function isDevMemFallbackEnabled(): boolean {
  return isDaaPgMemRuntime() && (process.env.NODE_ENV || "development").toLowerCase() !== "production";
}

export function isDevMemStoreUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /database\s+"[^"]+"\s+does\s+not\s+exist|auth_backend_unavailable|postgres|sql|pool|connection|connect|timeout|query/i.test(message);
}

export function shouldUseDevMemFallback(error?: unknown): boolean {
  if (!isDevMemFallbackEnabled()) return false;
  if (error == null) return true;
  return isDevMemStoreUnavailableError(error);
}

export function buildDevMemWorkbenchBootstrap(): WorkbenchBootstrap {
  const config = normalizedDefaultConfig();
  const rebalanceStrategy = buildRebalanceStrategyFallback();
  return {
    baseCurrency: config.strategy.account.baseCurrency || "USD",
    account: {
      cash: 0,
      investableCash: 0,
      frozenCash: 0,
      totalEquity: 0,
    },
    assetUniverse: [],
    execution: { logs: [] },
    rebalance: {
      mode: "manual",
      autoAnalysisEnabled: config.rebalanceStrategy.autoGenerateEnabled,
      analysisTimeUtc: config.rebalanceStrategy.analysisTimeUtc,
      timezone: config.rebalanceStrategy.timezone,
      analysisFocus: config.rebalanceStrategy.analysisFocus,
    },
    rebalanceStrategy,
    latestCycle: null,
    marketContext: null,
    warnings: [],
    marketDataHealth: {
      status: "down",
      freshCount: 0,
      staleCount: 0,
      missingCount: 0,
      recentJobFailureRatePct: 0,
      message: "dev_mem_store_unavailable",
    },
  };
}

export function buildDevMemWorkbenchReadModel(): WorkbenchReadModel {
  return {
    bootstrap: buildDevMemWorkbenchBootstrap(),
    cycles: [],
    snapshots: [],
    cashLedger: [],
    signals: [],
    allocationSummary: {
      holdingCount: 0,
      watchlistCount: 0,
      holdingValue: 0,
      cashValue: 0,
      investableCash: 0,
      frozenCash: 0,
      totalEquity: 0,
      topHoldings: [],
    },
    ledgerMeta: buildDevMemLedgerMeta(),
    notificationStatus: buildDevMemNotificationStatusSummary(),
    loadedAt: new Date().toISOString(),
  };
}

export function buildDevMemTradesReadModel(): TradesReadModel {
  return {
    baseCurrency: "USD",
    records: {
      cycles: [],
      orders: [],
    },
    reports: [],
    ledgerMeta: buildDevMemLedgerMeta(),
    loadedAt: new Date().toISOString(),
  };
}

export function buildDevMemStrategyLabSeedReadModel(): StrategyLabSeedReadModel {
  const config = normalizedDefaultConfig();
  const bootstrap = buildDevMemWorkbenchBootstrap();
  const execution = getStrategyExecutionConfig(config);
  return {
    bootstrap,
    baseCurrency: bootstrap.baseCurrency,
    initialEquity: 100000,
    constraints: {
      maxPositionPct: Number(config.strategy.constraints.maxPositionPct) || 0.3,
      minNotional: Number(config.strategy.constraints.minNotional) || 200,
      maxOrderPctOfNav: execution.maxOrderPctOfNav,
    },
    policy: {
      thresholdPct: Number(config.rebalanceStrategy.drift.thresholdPct) || 0.05,
      minTradeNotional: Number(config.strategy.constraints.minNotional) || 200,
      cooldownSeconds: (Number(config.rebalanceStrategy.cooldownHours) || 72) * 3600,
    },
    execution: {
      feeRateBps: execution.feeRateBps,
      slippageBps: execution.slippageBps,
      maxOrderPctOfNav: execution.maxOrderPctOfNav,
    },
    availableAssets: [],
    selectedAssetKeys: [],
    loadedAt: new Date().toISOString(),
  };
}

export function buildDevMemSystemConfigEnvelope(): DaaSystemConfigEnvelope {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    config: normalizedDefaultConfig(),
  };
}

export function buildDevMemMarketIndicatorHistory(input: {
  keys: DaaMarketIndicatorKey[];
  days: number;
  scope?: DaaMarketIndicatorScope;
}) {
  const history = {} as Record<
    DaaMarketIndicatorKey,
    Array<{ generatedAt: string; rawValue: number | null }>
  >;
  for (const key of MARKET_INDICATOR_KEYS_) history[key] = [];
  return {
    keys: input.keys,
    days: input.days,
    scope: input.scope || null,
    history,
    at: new Date().toISOString(),
  };
}
