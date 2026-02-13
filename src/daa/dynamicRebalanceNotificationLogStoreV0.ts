export const LS_DYNAMIC_REBALANCE_NOTIFICATION_LOG_V0 = "daa.dynamicRebalance.notificationLog.v0";

export type DynamicRebalanceNotificationKindV0 =
  | "schedule-due"
  | "skip-market-closed"
  | "skip-data-stale"
  | "run-recorded"
  | "unknown";

export type DynamicRebalanceNotificationLogEntryV0 = {
  id: string;

  // A scheduled wall-clock time (for schedule/skip), or a run recorded time (for run-recorded).
  at: string; // ISO timestamp

  // When the notification was recorded.
  recordedAt: string; // ISO timestamp

  kind: DynamicRebalanceNotificationKindV0;
  title: string;
  body: string;
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return String(c.randomUUID());
  return `notify_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeKind(x: unknown): DynamicRebalanceNotificationKindV0 | null {
  if (x === "schedule-due" || x === "skip-market-closed" || x === "skip-data-stale" || x === "run-recorded" || x === "unknown") return x;
  return null;
}

function normalizeEntry(x: unknown): DynamicRebalanceNotificationLogEntryV0 | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e: any = x as any;

  const id = String(e?.id ?? "").trim();
  const at = String(e?.at ?? "").trim();
  const recordedAt = String(e?.recordedAt ?? "").trim();
  const kind = normalizeKind(e?.kind);
  const title = String(e?.title ?? "").trim();
  const body = String(e?.body ?? "").trim();

  if (!id || !at || !recordedAt || !kind || !title || !body) return null;

  return { id, at, recordedAt, kind, title, body };
}

export function loadDynamicRebalanceNotificationLogV0(storage: Pick<Storage, "getItem">): DynamicRebalanceNotificationLogEntryV0[] {
  const raw = safeJsonParse(storage.getItem(LS_DYNAMIC_REBALANCE_NOTIFICATION_LOG_V0));
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEntry).filter((e): e is DynamicRebalanceNotificationLogEntryV0 => !!e);
}

export function clearDynamicRebalanceNotificationLogV0(storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(LS_DYNAMIC_REBALANCE_NOTIFICATION_LOG_V0, JSON.stringify([]));
  } catch {
    // ignore
  }
}

export function appendDynamicRebalanceNotificationLogV0(args: {
  storage: Pick<Storage, "getItem" | "setItem">;
  at: string;
  kind: DynamicRebalanceNotificationKindV0;
  title: string;
  body: string;
  recordedAt?: string;
  maxEntries?: number;
}): { ok: true; entry: DynamicRebalanceNotificationLogEntryV0 } | { ok: false; error: string } {
  const at = String(args.at ?? "").trim();
  if (!at) return { ok: false, error: "missing at" };

  const kind = args.kind ?? "unknown";

  const title = String(args.title ?? "").trim();
  const body = String(args.body ?? "").trim();
  if (!title || !body) return { ok: false, error: "missing title/body" };

  const recordedAt = String(args.recordedAt ?? nowIso()).trim() || nowIso();

  const prev = loadDynamicRebalanceNotificationLogV0(args.storage);
  const existing = prev.find((e) => e.at === at && e.kind === kind);
  if (existing) return { ok: true, entry: existing };

  const entry: DynamicRebalanceNotificationLogEntryV0 = {
    id: makeId(),
    at,
    recordedAt,
    kind,
    title,
    body,
  };

  const maxEntries = Math.max(1, Math.trunc(args.maxEntries ?? 50));
  const next = [...prev, entry].slice(-maxEntries);

  try {
    args.storage.setItem(LS_DYNAMIC_REBALANCE_NOTIFICATION_LOG_V0, JSON.stringify(next));
    return { ok: true, entry };
  } catch {
    return { ok: false, error: "failed to persist notification log" };
  }
}
