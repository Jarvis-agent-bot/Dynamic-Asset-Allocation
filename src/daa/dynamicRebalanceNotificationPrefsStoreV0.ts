export const LS_DYNAMIC_REBALANCE_NOTIFY_PREFS_V0 = "daa.dynamicRebalance.notifyPrefs.v0";

export type DynamicRebalanceNotifyPrefsV0 = {
  enabled: boolean;

  // Notification channels.
  channel: {
    // Uses the Web Notifications API when permission is granted.
    browser: boolean;
  };

  // Which events should produce a notification/log entry.
  events: {
    // A scheduled tick is due (schedule enabled, but no rebalance evaluation recorded yet).
    scheduleDue: boolean;

    // The scheduled tick is skipped due to market closed.
    skipMarketClosed: boolean;

    // The scheduled tick is skipped due to stale/missing price data.
    skipDataStale: boolean;

    // A paper (dry-run) rebalance was recorded.
    runRecorded: boolean;
  };
};

export type DynamicRebalanceNotifyPrefsStateV1 = {
  schemaVersion: 1;
  updatedAt: string;
  prefs: DynamicRebalanceNotifyPrefsV0;
};

function nowIso() {
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

export function defaultDynamicRebalanceNotifyPrefsV0(): DynamicRebalanceNotifyPrefsV0 {
  // Conservative default: record notifications (in local log) but don't pop browser notifications.
  return {
    enabled: true,
    channel: { browser: false },
    events: {
      scheduleDue: true,
      skipMarketClosed: true,
      skipDataStale: true,
      runRecorded: true,
    },
  };
}

function defaultStateV1(): DynamicRebalanceNotifyPrefsStateV1 {
  return { schemaVersion: 1, updatedAt: nowIso(), prefs: defaultDynamicRebalanceNotifyPrefsV0() };
}

function normalizeBool(x: unknown, fallback: boolean): boolean {
  return typeof x === "boolean" ? x : fallback;
}

function normalizePrefs(x: unknown): DynamicRebalanceNotifyPrefsV0 {
  const d = defaultDynamicRebalanceNotifyPrefsV0();

  if (!x || typeof x !== "object" || Array.isArray(x)) return d;
  const r: any = x as any;

  return {
    enabled: normalizeBool(r.enabled, d.enabled),
    channel: {
      browser: normalizeBool(r?.channel?.browser, d.channel.browser),
    },
    events: {
      scheduleDue: normalizeBool(r?.events?.scheduleDue, d.events.scheduleDue),
      skipMarketClosed: normalizeBool(r?.events?.skipMarketClosed, d.events.skipMarketClosed),
      skipDataStale: normalizeBool(r?.events?.skipDataStale, d.events.skipDataStale),
      runRecorded: normalizeBool(r?.events?.runRecorded, d.events.runRecorded),
    },
  };
}

export function loadDynamicRebalanceNotifyPrefsStateV1(storage: Pick<Storage, "getItem">): DynamicRebalanceNotifyPrefsStateV1 {
  const raw = safeJsonParse(storage.getItem(LS_DYNAMIC_REBALANCE_NOTIFY_PREFS_V0));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultStateV1();

  const r: any = raw as any;
  if (r.schemaVersion !== 1) return defaultStateV1();

  const prefs = normalizePrefs(r.prefs);
  const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();

  return { schemaVersion: 1, updatedAt, prefs };
}

export function persistDynamicRebalanceNotifyPrefsV0(args: {
  storage: Pick<Storage, "getItem" | "setItem">;
  prefsLike: unknown;
  updatedAt?: string;
}): { ok: true; state: DynamicRebalanceNotifyPrefsStateV1 } | { ok: false; error: string } {
  const prefs = normalizePrefs(args.prefsLike);
  const updatedAt = String(args.updatedAt ?? nowIso()).trim() || nowIso();

  const next: DynamicRebalanceNotifyPrefsStateV1 = {
    schemaVersion: 1,
    updatedAt,
    prefs,
  };

  try {
    args.storage.setItem(LS_DYNAMIC_REBALANCE_NOTIFY_PREFS_V0, JSON.stringify(next));
    return { ok: true, state: next };
  } catch {
    return { ok: false, error: "failed to persist prefs" };
  }
}
