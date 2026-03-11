import {
  DEFAULT_SYSTEM_CONFIG_V2,
  getStrategyExecutionConfigV2,
  normalizeSystemConfigV2,
  type DaaSystemConfigEnvelopeV2,
} from "@/src/daa/config/systemConfigV2";
import { isDaaPgMemRuntimeV0 } from "@/src/daa/pg/daaPgV0";
import { MARKET_INDICATOR_KEYS_V1 } from "@/src/daa/modules/marketContext/marketIndicatorCatalogV1";
import type {
  DaaMarketIndicatorKeyV1,
  DaaMarketIndicatorScopeV1,
} from "@/src/daa/modules/marketContext/marketContextTypesV1";
import type {
  OverviewReadModelV1,
  StrategyLabSeedReadModelV1,
  TradesReadModelV1,
  WorkbenchReadModelV1,
} from "@/src/daa/modules/read/readModelsV1";
import type {
  RebalanceStrategyConfigV1,
  WorkbenchBootstrapV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";

function cloneJsonV1<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizedDefaultConfigV1() {
  return normalizeSystemConfigV2(cloneJsonV1(DEFAULT_SYSTEM_CONFIG_V2));
}

function buildRebalanceStrategyFallbackV1(): RebalanceStrategyConfigV1 {
  const config = normalizedDefaultConfigV1();
  return {
    calendar: { ...config.rebalanceStrategy.calendar },
    drift: { ...config.rebalanceStrategy.drift },
    cooldownHours: config.rebalanceStrategy.cooldownHours,
    analysisTimeUtc: config.rebalanceStrategy.analysisTimeUtc,
    timezone: config.rebalanceStrategy.timezone,
    analysisFocus: config.rebalanceStrategy.analysisFocus,
    autoGenerateEnabled: config.rebalanceStrategy.autoGenerateEnabled,
    notifyEmailTo: config.rebalanceStrategy.notifyEmailTo,
    ...(config.rebalanceStrategy.cash ? { cash: { ...config.rebalanceStrategy.cash } } : {}),
  };
}

export function isDevMemFallbackEnabledV1(): boolean {
  return isDaaPgMemRuntimeV0() && (process.env.NODE_ENV || "development").toLowerCase() !== "production";
}

export function isDevMemStoreUnavailableErrorV1(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /database\s+"[^"]+"\s+does\s+not\s+exist|auth_backend_unavailable|postgres|sql|pool|connection|connect|timeout|query/i.test(message);
}

export function shouldUseDevMemFallbackV1(error?: unknown): boolean {
  if (!isDevMemFallbackEnabledV1()) return false;
  if (error == null) return true;
  return isDevMemStoreUnavailableErrorV1(error);
}

export function buildDevMemWorkbenchBootstrapV1(): WorkbenchBootstrapV1 {
  const config = normalizedDefaultConfigV1();
  const rebalanceStrategy = buildRebalanceStrategyFallbackV1();
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
      emailTo: config.rebalanceStrategy.notifyEmailTo,
      analysisFocus: config.rebalanceStrategy.analysisFocus,
    },
    rebalanceStrategy,
    overviewAlerts: [],
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

export function buildDevMemOverviewReadModelV1(): OverviewReadModelV1 {
  return {
    bootstrap: buildDevMemWorkbenchBootstrapV1(),
    snapshots: [],
    cashLedger: [],
    loadedAt: new Date().toISOString(),
  };
}

export function buildDevMemWorkbenchReadModelV1(): WorkbenchReadModelV1 {
  return {
    bootstrap: buildDevMemWorkbenchBootstrapV1(),
    cycles: [],
    loadedAt: new Date().toISOString(),
  };
}

export function buildDevMemTradesReadModelV1(): TradesReadModelV1 {
  return {
    records: {
      cycles: [],
      orders: [],
    },
    reports: [],
    loadedAt: new Date().toISOString(),
  };
}

export function buildDevMemStrategyLabSeedReadModelV1(): StrategyLabSeedReadModelV1 {
  const config = normalizedDefaultConfigV1();
  const bootstrap = buildDevMemWorkbenchBootstrapV1();
  const execution = getStrategyExecutionConfigV2(config);
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

export function buildDevMemSystemConfigEnvelopeV1(): DaaSystemConfigEnvelopeV2 {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    config: normalizedDefaultConfigV1(),
  };
}

export function buildDevMemMarketIndicatorHistoryV1(input: {
  keys: DaaMarketIndicatorKeyV1[];
  days: number;
  scope?: DaaMarketIndicatorScopeV1;
}) {
  const history = {} as Record<
    DaaMarketIndicatorKeyV1,
    Array<{ generatedAt: string; rawValue: number | null }>
  >;
  for (const key of MARKET_INDICATOR_KEYS_V1) history[key] = [];
  return {
    keys: input.keys,
    days: input.days,
    scope: input.scope || null,
    history,
    at: new Date().toISOString(),
  };
}
