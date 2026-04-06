import { DEFAULT_SYSTEM_CONFIG_, normalizeSystemConfig, type DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { MarketPriceResolved } from "@/src/daa/modules/marketCache/marketCacheService";
import type {
  AssetUniverseView,
  GenerateRebalanceCycleResult,
  WorkbenchBootstrap,
} from "@/src/daa/modules/workbench/workbenchTypes";
import type {
  DaaStoreAccountState,
  DaaStoreAssetUniverseRow,
  DaaStoreSystemConfigRow,
} from "@/src/daa/store/daaStorePg";

type DeepPartial<T> = T extends Array<unknown>
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, overrides?: DeepPartial<T>): T {
  if (overrides === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides as T;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeDeep(current, value)
      : value;
  }
  return result as T;
}

export function buildSystemConfigRow(
  configOverrides?: DeepPartial<DaaSystemConfig>,
  rowOverrides?: Partial<Omit<DaaStoreSystemConfigRow, "config">>,
): DaaStoreSystemConfigRow {
  return {
    id: "default",
    version: rowOverrides?.version ?? 1,
    updatedAt: rowOverrides?.updatedAt ?? "2026-03-01T00:00:00.000Z",
    config: normalizeSystemConfig(mergeDeep(DEFAULT_SYSTEM_CONFIG_, configOverrides)),
  };
}

export function buildAccountState(
  overrides?: Partial<DaaStoreAccountState>,
): DaaStoreAccountState {
  return {
    id: "default",
    baseCurrency: "USD",
    cash: 1000,
    frozenCash: 0,
    investableCash: 1000,
    totalEquity: 1000,
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildAssetUniverseRow(
  overrides?: Partial<DaaStoreAssetUniverseRow>,
): DaaStoreAssetUniverseRow {
  return {
    assetKey: "US::AAPL",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    assetClass: "EQUITY",
    region: "US",
    exchange: "NASDAQ",
    instrumentType: "STOCK",
    marketGroup: "US_EQUITY",
    holdingQty: 0,
    holdingPrice: 0,
    costBasis: null,
    costBasisInBase: null,
    holdingTags: [],
    watchEnabled: true,
    targetWeightHint: 0,
    watchTags: [],
    notes: null,
    priceAlertAbove: null,
    priceAlertBelow: null,
    lastPrice: 100,
    priceUpdatedAt: "2026-03-01T00:00:00.000Z",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildAssetUniverseView(
  overrides?: Partial<AssetUniverseView>,
): AssetUniverseView {
  return {
    assetKey: "US::AAPL",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    assetClass: "EQUITY",
    region: "US",
    exchange: "NASDAQ",
    instrumentType: "STOCK",
    marketGroup: "US_EQUITY",
    yfinanceSymbol: "AAPL",
    holdingQty: 0,
    holdingPrice: 0,
    costBasis: null,
    costBasisInBase: null,
    unrealizedPnlBase: null,
    unrealizedPnlPct: null,
    holdingTags: [],
    watchEnabled: true,
    targetWeightHint: 0,
    watchTags: [],
    notes: null,
    priceAlertAbove: null,
    priceAlertBelow: null,
    lastPrice: 100,
    priceUpdatedAt: "2026-03-01T00:00:00.000Z",
    priceStatus: "fresh",
    priceSource: "yfinance:AAPL",
    priceAgeSec: 60,
    valuationBase: 0,
    fxRateToBase: 1,
    fxMissing: false,
    actualWeightPct: 0,
    targetWeightPct: 0,
    gapPct: null,
    hfSignal: null,
    ...overrides,
  };
}

export function buildWorkbenchBootstrap(
  overrides?: DeepPartial<WorkbenchBootstrap>,
): WorkbenchBootstrap {
  return mergeDeep<WorkbenchBootstrap>({
    baseCurrency: "USD",
    account: {
      cash: 1000,
      investableCash: 1000,
      frozenCash: 0,
      totalEquity: 1000,
    },
    assetUniverse: [],
    execution: {
      logs: [],
    },
    rebalance: {
      mode: "manual",
      autoAnalysisEnabled: false,
      analysisTimeUtc: "00:20",
      timezone: "Asia/Shanghai",
      analysisFocus: "mock",
    },
    rebalanceStrategy: DEFAULT_SYSTEM_CONFIG_.rebalanceStrategy,
    latestCycle: null,
    marketContext: null,
    warnings: [],
  }, overrides);
}

export function buildMarketPriceResolved(
  overrides?: Partial<MarketPriceResolved>,
): MarketPriceResolved {
  return {
    provider: "yfinance",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    price: 100,
    priceStatus: "fresh",
    priceUpdatedAt: "2026-03-01T00:00:00.000Z",
    priceAgeSec: 60,
    priceSource: "test:yfinance:AAPL",
    ...overrides,
  };
}

export function buildGenerateRebalanceCycleResult(
  overrides?: DeepPartial<GenerateRebalanceCycleResult>,
): GenerateRebalanceCycleResult {
  return mergeDeep<GenerateRebalanceCycleResult>({
    cycle: null,
    created: false,
    skippedByCooldown: false,
    cooldownUntil: null,
    message: "",
    portfolioStatus: "skipped",
    marketRegime: null,
    llmSummary: null,
  }, overrides);
}
