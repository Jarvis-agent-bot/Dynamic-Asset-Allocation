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
