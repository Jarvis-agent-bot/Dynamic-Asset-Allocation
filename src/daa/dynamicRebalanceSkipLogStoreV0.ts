import type { DynamicRebalancePauseReasonV0 } from "./dynamicRebalancePausedReasonV0";

export const LS_DYNAMIC_REBALANCE_SKIP_LOG_V0 = "daa.dynamicRebalance.skipLog.v0";

export type DynamicRebalanceSkipLogEntryV0 = {
  id: string;

  // The scheduled wall-clock run time that was skipped.
  at: string; // ISO timestamp

  // When we recorded the skip event.
  recordedAt: string; // ISO timestamp

  kind: DynamicRebalancePauseReasonV0["kind"] | "unknown";
  title: string;
  detail: string;

  // Optional structured context for the UI.
  nextOpenAt?: string;
  priceUpdatedAt?: string;
  ageMin?: number;
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return String(c.randomUUID());
  return `skip_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeKind(x: unknown): DynamicRebalanceSkipLogEntryV0["kind"] | null {
  if (x === "paused-market-closed" || x === "stalled-data-stale") return x;
  return x === "unknown" ? "unknown" : null;
}

function normalizeEntry(x: unknown): DynamicRebalanceSkipLogEntryV0 | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e: any = x as any;

  const id = String(e?.id ?? "").trim();
  const at = String(e?.at ?? "").trim();
  const recordedAt = String(e?.recordedAt ?? "").trim();
  const kind = normalizeKind(e?.kind);
  const title = String(e?.title ?? "").trim();
  const detail = String(e?.detail ?? "").trim();

  if (!id || !at || !recordedAt || !kind || !title || !detail) return null;

  const nextOpenAt = typeof e.nextOpenAt === "string" && e.nextOpenAt ? e.nextOpenAt : undefined;
  const priceUpdatedAt = typeof e.priceUpdatedAt === "string" && e.priceUpdatedAt ? e.priceUpdatedAt : undefined;
  const ageMin = typeof e.ageMin === "number" && Number.isFinite(e.ageMin) ? e.ageMin : undefined;

  return { id, at, recordedAt, kind, title, detail, nextOpenAt, priceUpdatedAt, ageMin };
}

export function loadDynamicRebalanceSkipLogV0(storage: Pick<Storage, "getItem">): DynamicRebalanceSkipLogEntryV0[] {
  const raw = safeJsonParse(storage.getItem(LS_DYNAMIC_REBALANCE_SKIP_LOG_V0));
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEntry).filter((e): e is DynamicRebalanceSkipLogEntryV0 => !!e);
}

export function clearDynamicRebalanceSkipLogV0(storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(LS_DYNAMIC_REBALANCE_SKIP_LOG_V0, JSON.stringify([]));
  } catch {
    // ignore
  }
}

export function appendDynamicRebalanceSkipLogV0(args: {
  storage: Pick<Storage, "getItem" | "setItem">;
  at: string;
  reason: DynamicRebalancePauseReasonV0;
  recordedAt?: string;
  maxEntries?: number;
}): { ok: true; entry: DynamicRebalanceSkipLogEntryV0 } | { ok: false; error: string } {
  const at = String(args.at ?? "").trim();
  if (!at) return { ok: false, error: "missing at" };

  const recordedAt = String(args.recordedAt ?? nowIso()).trim() || nowIso();
  const kind = args.reason?.kind ?? "unknown";

  const prev = loadDynamicRebalanceSkipLogV0(args.storage);
  const existing = prev.find((e) => e.at === at && e.kind === kind);
  if (existing) return { ok: true, entry: existing };

  const entry: DynamicRebalanceSkipLogEntryV0 = {
    id: makeId(),
    at,
    recordedAt,
    kind,
    title: String(args.reason?.title ?? "Skipped").trim() || "Skipped",
    detail: String(args.reason?.detail ?? "").trim() || "<missing detail>",
  };

  if (args.reason.kind === "paused-market-closed") {
    entry.nextOpenAt = args.reason.nextOpenAt ? args.reason.nextOpenAt.toISOString() : undefined;
  }

  if (args.reason.kind === "stalled-data-stale") {
    entry.priceUpdatedAt = args.reason.priceUpdatedAt ? args.reason.priceUpdatedAt.toISOString() : undefined;
    entry.ageMin = typeof args.reason.ageMin === "number" ? args.reason.ageMin : undefined;
  }

  const maxEntries = Math.max(1, Math.trunc(args.maxEntries ?? 30));
  const next = [...prev, entry].slice(-maxEntries);

  try {
    args.storage.setItem(LS_DYNAMIC_REBALANCE_SKIP_LOG_V0, JSON.stringify(next));
    return { ok: true, entry };
  } catch {
    return { ok: false, error: "failed to persist skip log" };
  }
}
