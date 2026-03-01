"use client";

export const DAA_RUNTIME_DATA_EVENT_V1 = "daa:data:updated";

export const LS_UNIFIED_INPUT_V1 = "daa.unified.input.v1";
export const LS_UNIFIED_MIGRATION_MARK_V1 = "daa.unified.input.migrated.v1";

// 已下线的历史存储 key，仅用于启动时清理，不再做兼容读写。
export const DEPRECATED_STORAGE_KEYS_V1 = [
  "daa.wizard.moneyPlan",
  "daa.wizard.marketEvents",
  "daa.step6.humanProfile",
  "daa.portfolio.state",
  "daa.targetWeights",
  "daa.priceSnapshot.v1",
  "daa.wizard.rebalanceRequest",
  "daa.wizard.rebalanceResponse",
  "holdings",
] as const;

export type UnifiedInputDeprecatedKeyV1 = (typeof DEPRECATED_STORAGE_KEYS_V1)[number];

export type DaaPositionRow = {
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  tags: string[];
  liquidityNotional24h: number;
};

export type DaaAnalystRow = {
  analystId: string;
  accuracyPct: number;
  riskControlPct: number;
  disciplinePct: number;
  transparencyPct: number;
  stance: "offensive" | "neutral" | "defensive";
  styleCluster: string;
};

export type DaaAssetViewRow = {
  symbol: string;
  analystId: string;
  convictionPct: number;
  thesisDriftPct: number;
  momentumRegime: "strong" | "neutral" | "weak";
};

export type DaaHfFundTrackRow = {
  fundCode: string;
  label: string;
  kind: "equity" | "qdii" | "balanced";
  enabled: boolean;
};

export type DaaStrategyConfig = {
  account: { cash: number; totalEquity: number | null };
  constraints: {
    maxPositionPct: number;
    minNotional: number;
    maxOrderPctOfNav: number;
    maxOrderPctOfLiquidity: number;
  };
  policy: {
    baseDriftTriggerPct: number;
    strongTrendDriftTriggerPct: number;
    riskOffConsensusPct: number;
    riskOffScalePct: number;
    valueTrapThesisDriftPct: number;
    sbIsolationScorePct: number;
  };
  targetWeights: Record<string, number>;
  feedSymbols: string;
  twitterQuery: string;
};

export type DaaRunHistoryEntry = {
  id: string;
  ts: string;
  request: unknown;
  response: unknown;
};

export type DaaEquitySnapshot = {
  ts: string;
  equity: number;
  holdingsValue: number;
  cash: number;
  source: "auto" | "run" | "refresh";
};

export type UnifiedInputStateV1 = {
  schemaVersion: 1;
  updatedAt: string;
  moneyPlan: unknown | null;
  marketEvents: unknown | null;
  humanProfile: unknown | null;
  portfolioState: unknown | null;
  targetWeightsState: unknown | null;
  priceSnapshot: unknown | null;
  unifiedRequestDraft: unknown | null;
  positions: DaaPositionRow[] | null;
  // 兼容字段：当前主流程已迁移到基金池人因输入，保留用于历史数据回放。
  analysts: DaaAnalystRow[] | null;
  // 兼容字段：当前主流程已迁移到基金池人因输入，保留用于历史数据回放。
  assetViews: DaaAssetViewRow[] | null;
  // 当前人因层主输入：基金池。
  hfFundRegistry: DaaHfFundTrackRow[] | null;
  strategyConfig: DaaStrategyConfig | null;
  lastRunResult: unknown | null;
  syncLog: string[] | null;
  runHistory: DaaRunHistoryEntry[] | null;
  equitySnapshots: DaaEquitySnapshot[] | null;
  opLog: string[] | null;
};

export type UnifiedInputSliceKeyV1 = keyof Omit<UnifiedInputStateV1, "schemaVersion" | "updatedAt">;

function nowIso(): string {
  return new Date().toISOString();
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export const DEFAULT_STRATEGY_CONFIG: DaaStrategyConfig = {
  account: { cash: 0, totalEquity: null },
  constraints: {
    maxPositionPct: 1,
    minNotional: 200,
    maxOrderPctOfNav: 0.1,
    maxOrderPctOfLiquidity: 0.15,
  },
  policy: {
    baseDriftTriggerPct: 0.05,
    strongTrendDriftTriggerPct: 0.1,
    riskOffConsensusPct: 0.6,
    riskOffScalePct: 0.7,
    valueTrapThesisDriftPct: 0.12,
    sbIsolationScorePct: 0.35,
  },
  targetWeights: {},
  feedSymbols: "SPY,QQQ,BND,TSLA",
  twitterQuery: "(SPY OR QQQ OR TSLA) lang:en",
};

export const DEFAULT_HF_FUND_REGISTRY: DaaHfFundTrackRow[] = [
  { fundCode: "006533", label: "易方达科融混合", kind: "equity", enabled: true },
  { fundCode: "100055", label: "富国全球科技互联网", kind: "qdii", enabled: true },
  { fundCode: "005827", label: "易方达蓝筹精选", kind: "equity", enabled: true },
  { fundCode: "110011", label: "易方达中小盘", kind: "equity", enabled: true },
  { fundCode: "161725", label: "招商中证白酒指数", kind: "equity", enabled: true },
  { fundCode: "000248", label: "汇添富中证主要消费ETF联接", kind: "equity", enabled: true },
  { fundCode: "005918", label: "工银前沿医疗股票", kind: "equity", enabled: true },
  { fundCode: "486001", label: "工银全球精选股票QDII", kind: "qdii", enabled: true },
  { fundCode: "000834", label: "大成景安短融债券", kind: "balanced", enabled: true },
  { fundCode: "000874", label: "广发全球精选股票QDII", kind: "qdii", enabled: true },
];

function defaultUnifiedInputStateV1(): UnifiedInputStateV1 {
  return {
    schemaVersion: 1,
    updatedAt: nowIso(),
    moneyPlan: null,
    marketEvents: null,
    humanProfile: null,
    portfolioState: null,
    targetWeightsState: null,
    priceSnapshot: null,
    unifiedRequestDraft: null,
    positions: null,
    analysts: null,
    assetViews: null,
    hfFundRegistry: null,
    strategyConfig: null,
    lastRunResult: null,
    syncLog: null,
    runHistory: null,
    equitySnapshots: null,
    opLog: null,
  };
}

function normalizeUnifiedInputStateV1(raw: unknown): UnifiedInputStateV1 | null {
  if (!isPlainObject(raw)) return null;
  if (raw.schemaVersion !== 1) return null;

  return {
    schemaVersion: 1,
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : nowIso(),
    moneyPlan: "moneyPlan" in raw ? raw.moneyPlan ?? null : null,
    marketEvents: "marketEvents" in raw ? raw.marketEvents ?? null : null,
    humanProfile: "humanProfile" in raw ? raw.humanProfile ?? null : null,
    portfolioState: "portfolioState" in raw ? raw.portfolioState ?? null : null,
    targetWeightsState: "targetWeightsState" in raw ? raw.targetWeightsState ?? null : null,
    priceSnapshot: "priceSnapshot" in raw ? raw.priceSnapshot ?? null : null,
    unifiedRequestDraft: "unifiedRequestDraft" in raw ? raw.unifiedRequestDraft ?? null : null,
    positions: "positions" in raw && Array.isArray(raw.positions) ? raw.positions as DaaPositionRow[] : null,
    analysts: "analysts" in raw && Array.isArray(raw.analysts) ? raw.analysts as DaaAnalystRow[] : null,
    assetViews: "assetViews" in raw && Array.isArray(raw.assetViews) ? raw.assetViews as DaaAssetViewRow[] : null,
    hfFundRegistry: "hfFundRegistry" in raw && Array.isArray(raw.hfFundRegistry) ? raw.hfFundRegistry as DaaHfFundTrackRow[] : null,
    strategyConfig: "strategyConfig" in raw && isPlainObject(raw.strategyConfig) ? raw.strategyConfig as unknown as DaaStrategyConfig : null,
    lastRunResult: "lastRunResult" in raw ? raw.lastRunResult ?? null : null,
    syncLog: "syncLog" in raw && Array.isArray(raw.syncLog) ? raw.syncLog as string[] : null,
    runHistory: "runHistory" in raw && Array.isArray(raw.runHistory) ? raw.runHistory as DaaRunHistoryEntry[] : null,
    equitySnapshots: "equitySnapshots" in raw && Array.isArray(raw.equitySnapshots) ? raw.equitySnapshots as DaaEquitySnapshot[] : null,
    opLog: "opLog" in raw && Array.isArray(raw.opLog) ? raw.opLog as string[] : null,
  };
}

function dispatchDataEventV1() {
  try {
    window.dispatchEvent(new CustomEvent(DAA_RUNTIME_DATA_EVENT_V1));
  } catch {
    // ignore
  }
}

function cleanupKeysV1(storage: Storage, keys: readonly string[]): string[] {
  const removed: string[] = [];
  for (const key of keys) {
    try {
      if (storage.getItem(key) === null) continue;
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // ignore
    }
  }
  return removed;
}

export function cleanupDeprecatedStorageKeysV1(): string[] {
  if (typeof window === "undefined") return [];
  return cleanupKeysV1(window.localStorage, DEPRECATED_STORAGE_KEYS_V1);
}

function markUnifiedMigrationDoneV1(storage: Storage) {
  try {
    storage.setItem(LS_UNIFIED_MIGRATION_MARK_V1, nowIso());
  } catch {
    // ignore
  }
}

function hasMarkedUnifiedMigrationV1(storage: Storage): boolean {
  try {
    return Boolean(storage.getItem(LS_UNIFIED_MIGRATION_MARK_V1));
  } catch {
    return false;
  }
}

export function bootstrapUnifiedInputRuntimeV1(opts: { dispatchEvent?: boolean } = {}): UnifiedInputStateV1 {
  const state = loadUnifiedInputStateV1();
  if (typeof window === "undefined") return state;

  const storage = window.localStorage;
  if (!hasMarkedUnifiedMigrationV1(storage)) {
    cleanupKeysV1(storage, DEPRECATED_STORAGE_KEYS_V1);
    markUnifiedMigrationDoneV1(storage);
    if (opts.dispatchEvent !== false) dispatchDataEventV1();
  }

  return state;
}

export function loadUnifiedInputStateV1(): UnifiedInputStateV1 {
  if (typeof window === "undefined") return defaultUnifiedInputStateV1();

  const storage = window.localStorage;
  const fromUnified = normalizeUnifiedInputStateV1(safeJsonParse(storage.getItem(LS_UNIFIED_INPUT_V1)));
  if (fromUnified) return fromUnified;
  return defaultUnifiedInputStateV1();
}

export function saveUnifiedInputStateV1(
  state: UnifiedInputStateV1,
  opts: {
    dispatchEvent?: boolean;
    cleanupLegacyKeys?: boolean;
  } = {},
) {
  if (typeof window === "undefined") return;

  const next: UnifiedInputStateV1 = {
    ...defaultUnifiedInputStateV1(),
    ...state,
    schemaVersion: 1,
    updatedAt: typeof state.updatedAt === "string" && state.updatedAt ? state.updatedAt : nowIso(),
  };

  try {
    window.localStorage.setItem(LS_UNIFIED_INPUT_V1, JSON.stringify(next));
  } catch {
    // ignore
  }

  if (opts.cleanupLegacyKeys !== false) {
    cleanupKeysV1(window.localStorage, DEPRECATED_STORAGE_KEYS_V1);
    markUnifiedMigrationDoneV1(window.localStorage);
  }

  if (opts.dispatchEvent !== false) dispatchDataEventV1();
}

export function patchUnifiedInputStateV1(
  patch: Partial<Omit<UnifiedInputStateV1, "schemaVersion" | "updatedAt">>,
  opts: {
    dispatchEvent?: boolean;
    cleanupLegacyKeys?: boolean;
  } = {},
): UnifiedInputStateV1 {
  const current = loadUnifiedInputStateV1();
  const next: UnifiedInputStateV1 = {
    ...current,
    ...patch,
    schemaVersion: 1,
    updatedAt: nowIso(),
  };
  saveUnifiedInputStateV1(next, {
    dispatchEvent: opts.dispatchEvent,
    cleanupLegacyKeys: opts.cleanupLegacyKeys,
  });
  return next;
}

export function readUnifiedInputSliceV1<T = unknown>(sliceKey: UnifiedInputSliceKeyV1): T | null {
  const st = loadUnifiedInputStateV1();
  return (st[sliceKey] ?? null) as T | null;
}

export function writeUnifiedInputSliceV1(
  sliceKey: UnifiedInputSliceKeyV1,
  value: unknown,
  opts: {
    dispatchEvent?: boolean;
    cleanupLegacyKeys?: boolean;
  } = {},
): UnifiedInputStateV1 {
  return patchUnifiedInputStateV1({ [sliceKey]: value ?? null }, opts);
}

export function saveUnifiedRequestDraftV1(request: unknown, opts: { dispatchEvent?: boolean } = {}) {
  writeUnifiedInputSliceV1("unifiedRequestDraft", request ?? null, {
    dispatchEvent: opts.dispatchEvent,
    cleanupLegacyKeys: false,
  });
}

export function loadUnifiedMoneyPlanV1<T = unknown>(): T | null {
  return readUnifiedInputSliceV1<T>("moneyPlan");
}

export function saveUnifiedMoneyPlanV1(value: unknown, opts: { dispatchEvent?: boolean } = {}) {
  writeUnifiedInputSliceV1("moneyPlan", value, {
    dispatchEvent: opts.dispatchEvent,
    cleanupLegacyKeys: true,
  });
}

export function loadUnifiedMarketEventsV1<T = unknown>(): T | null {
  return readUnifiedInputSliceV1<T>("marketEvents");
}

export function saveUnifiedMarketEventsV1(value: unknown, opts: { dispatchEvent?: boolean } = {}) {
  writeUnifiedInputSliceV1("marketEvents", value, {
    dispatchEvent: opts.dispatchEvent,
    cleanupLegacyKeys: true,
  });
}

export function loadUnifiedHumanProfileV1<T = unknown>(): T | null {
  return readUnifiedInputSliceV1<T>("humanProfile");
}

export function saveUnifiedHumanProfileV1(value: unknown, opts: { dispatchEvent?: boolean } = {}) {
  writeUnifiedInputSliceV1("humanProfile", value, {
    dispatchEvent: opts.dispatchEvent,
    cleanupLegacyKeys: true,
  });
}

export function loadUnifiedPortfolioStateV1<T = unknown>(): T | null {
  return readUnifiedInputSliceV1<T>("portfolioState");
}

export function saveUnifiedPortfolioStateV1(value: unknown, opts: { dispatchEvent?: boolean } = {}) {
  writeUnifiedInputSliceV1("portfolioState", value, {
    dispatchEvent: opts.dispatchEvent,
    cleanupLegacyKeys: true,
  });
}

export function loadUnifiedTargetWeightsStateV1<T = unknown>(): T | null {
  return readUnifiedInputSliceV1<T>("targetWeightsState");
}

export function saveUnifiedTargetWeightsStateV1(value: unknown, opts: { dispatchEvent?: boolean } = {}) {
  writeUnifiedInputSliceV1("targetWeightsState", value, {
    dispatchEvent: opts.dispatchEvent,
    cleanupLegacyKeys: true,
  });
}

export function loadUnifiedPriceSnapshotV1<T = unknown>(): T | null {
  return readUnifiedInputSliceV1<T>("priceSnapshot");
}

export function saveUnifiedPriceSnapshotV1(value: unknown, opts: { dispatchEvent?: boolean } = {}) {
  writeUnifiedInputSliceV1("priceSnapshot", value, {
    dispatchEvent: opts.dispatchEvent,
    cleanupLegacyKeys: true,
  });
}
