import type { ExecutionOrder } from "./executionLogStore";

export const LS_REBALANCE_ORDER_STATUS_RUN_V0 = "daa.rebalance.orderStatus.run.v0";
export const LS_REBALANCE_ORDER_STATUS_RUN_HISTORY_V0 = "daa.rebalance.orderStatus.run.history.v0";

export type OrderStatusV0 = "queued" | "submitted" | "filled" | "failed";

export type RebalanceOrderStatusV0 = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  notional: number;
  status: OrderStatusV0;
  // Optional fill progress (for brokers that can report partial fills).
  filledNotional?: number;
  // 0..1 inclusive.
  fillPct01?: number;
  updatedAt: string;
  detail?: string;
};

export type RebalanceOrderStatusRunPhaseV0 =
  | "idle"
  | "fetching_core"
  | "validating"
  | "executing"
  | "recorded"
  | "done"
  | "error";

export type RebalanceOrderStatusRunMetaV0 = {
  notes?: string;
  tags?: string[];
};

export type RebalanceOrderStatusRunV0 = {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  updatedAt: string;
  state: "running" | "done" | "error";
  phase: RebalanceOrderStatusRunPhaseV0;
  message?: string;
  error?: string;
  meta?: RebalanceOrderStatusRunMetaV0;
  orders: RebalanceOrderStatusV0[];
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return `${prefix}_${String(c.randomUUID())}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeOrderStatusV0(x: unknown): OrderStatusV0 {
  return x === "submitted" || x === "filled" || x === "failed" ? x : "queued";
}

function normalizePhaseV0(x: unknown): RebalanceOrderStatusRunPhaseV0 {
  return x === "fetching_core" ||
    x === "validating" ||
    x === "executing" ||
    x === "recorded" ||
    x === "done" ||
    x === "error"
    ? x
    : "idle";
}


function normalizeTagsV0(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const t of x) {
    const raw = typeof t === "string" ? t : String(t ?? "");
    const tag = raw.trim();
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(tag);
    if (out.length >= 24) break;
  }

  return out;
}

function normalizeMetaV0(x: unknown): RebalanceOrderStatusRunMetaV0 | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  const r: any = x as any;

  const notes = typeof r?.notes === "string" ? String(r.notes).trim() : "";
  const tags = normalizeTagsV0(r?.tags);

  const meta: RebalanceOrderStatusRunMetaV0 = {};
  if (notes) meta.notes = notes;
  if (tags.length) meta.tags = tags;

  return meta.notes || meta.tags ? meta : undefined;
}

function normalizeMetaInputV0(x: RebalanceOrderStatusRunMetaV0 | null | undefined): RebalanceOrderStatusRunMetaV0 | undefined {
  if (!x) return undefined;

  const notes = typeof x.notes === "string" ? String(x.notes).trim() : "";
  const tags = normalizeTagsV0(x.tags);

  const meta: RebalanceOrderStatusRunMetaV0 = {};
  if (notes) meta.notes = notes;
  if (tags.length) meta.tags = tags;

  return meta.notes || meta.tags ? meta : undefined;
}

function normalizeOrdersV0(x: unknown): RebalanceOrderStatusV0[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((o: any) => {
      const id = String(o?.id ?? "").trim();
      const symbol = String(o?.symbol ?? "").trim();
      const sideRaw = String(o?.side ?? "").trim();
      const side: "BUY" | "SELL" | null = sideRaw === "BUY" ? "BUY" : sideRaw === "SELL" ? "SELL" : null;
      const notional = Number(o?.notional ?? NaN);
      const status = normalizeOrderStatusV0(o?.status);
      const filledNotionalRaw = Number(o?.filledNotional ?? NaN);
      const filledNotional = Number.isFinite(filledNotionalRaw) && filledNotionalRaw >= 0 ? filledNotionalRaw : undefined;
      const fillPct01Raw = Number(o?.fillPct01 ?? NaN);
      const fillPct01 = Number.isFinite(fillPct01Raw) ? Math.max(0, Math.min(1, fillPct01Raw)) : undefined;
      const updatedAt = String(o?.updatedAt ?? "").trim();
      const detail = o?.detail === undefined ? undefined : String(o.detail);

      if (!id || !symbol || !side || !Number.isFinite(notional) || !updatedAt) return null;
      const base: RebalanceOrderStatusV0 = { id, symbol, side, notional, status, updatedAt };
      const withDetail = detail === undefined ? base : { ...base, detail };
      const withFilledNotional = filledNotional === undefined ? withDetail : { ...withDetail, filledNotional };
      return fillPct01 === undefined ? withFilledNotional : { ...withFilledNotional, fillPct01 };
    })
    .filter((o): o is RebalanceOrderStatusV0 => !!o);
}

function normalizeRunV0(x: unknown): RebalanceOrderStatusRunV0 | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r: any = x as any;
  if (r.schemaVersion !== 1) return null;

  const runId = String(r.runId ?? "").trim();
  const createdAt = String(r.createdAt ?? "").trim();
  const updatedAt = String(r.updatedAt ?? "").trim();
  const state: "running" | "done" | "error" = r.state === "done" ? "done" : r.state === "error" ? "error" : "running";
  const phase = normalizePhaseV0(r.phase);
  const orders = normalizeOrdersV0(r.orders);

  if (!runId || !createdAt || !updatedAt) return null;

  const message = typeof r.message === "string" && r.message ? r.message : undefined;
  const error = typeof r.error === "string" && r.error ? r.error : undefined;

  const meta = normalizeMetaV0(r.meta);

  return { schemaVersion: 1, runId, createdAt, updatedAt, state, phase, message, error, meta, orders };
}

export function loadRebalanceOrderStatusRunV0(
  storage: Pick<Storage, "getItem"> | null | undefined,
): RebalanceOrderStatusRunV0 | null {
  if (!storage) return null;
  const raw = safeJsonParse(storage.getItem(LS_REBALANCE_ORDER_STATUS_RUN_V0));
  return normalizeRunV0(raw);
}

export function saveRebalanceOrderStatusRunV0(
  storage: Pick<Storage, "setItem"> | null | undefined,
  run: RebalanceOrderStatusRunV0,
): { ok: true } | { ok: false; error: string } {
  if (!storage) return { ok: false, error: "missing storage" };
  try {
    storage.setItem(LS_REBALANCE_ORDER_STATUS_RUN_V0, JSON.stringify(run));
    return { ok: true };
  } catch {
    return { ok: false, error: "failed to persist rebalance order status run" };
  }
}

export function clearRebalanceOrderStatusRunV0(storage: Pick<Storage, "setItem"> | null | undefined) {
  if (!storage) return;
  try {
    storage.setItem(LS_REBALANCE_ORDER_STATUS_RUN_V0, JSON.stringify(null));
  } catch {
    // ignore
  }
}

export function loadRebalanceOrderStatusRunHistoryV0(
  storage: Pick<Storage, "getItem"> | null | undefined,
): RebalanceOrderStatusRunV0[] {
  if (!storage) return [];
  const raw = safeJsonParse(storage.getItem(LS_REBALANCE_ORDER_STATUS_RUN_HISTORY_V0));
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRunV0).filter((r): r is RebalanceOrderStatusRunV0 => !!r);
}

export function upsertRebalanceOrderStatusRunHistoryV0(args: {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  run: RebalanceOrderStatusRunV0;
  maxEntries?: number;
}): { ok: true; history: RebalanceOrderStatusRunV0[] } | { ok: false; error: string } {
  if (!args.storage) return { ok: false, error: "missing storage" };

  const prev = loadRebalanceOrderStatusRunHistoryV0(args.storage);
  const idx = prev.findIndex((r) => r.runId === args.run.runId);
  const updated = idx >= 0 ? [...prev.slice(0, idx), args.run, ...prev.slice(idx + 1)] : [...prev, args.run];

  const max = Number.isFinite(args.maxEntries) && (args.maxEntries as number) > 0 ? (args.maxEntries as number) : 200;
  const next = updated.slice(-max);

  try {
    args.storage.setItem(LS_REBALANCE_ORDER_STATUS_RUN_HISTORY_V0, JSON.stringify(next));
    return { ok: true, history: next };
  } catch {
    return { ok: false, error: "failed to persist rebalance order status run history" };
  }
}

export function clearRebalanceOrderStatusRunHistoryV0(storage: Pick<Storage, "setItem"> | null | undefined) {
  if (!storage) return;
  try {
    storage.setItem(LS_REBALANCE_ORDER_STATUS_RUN_HISTORY_V0, JSON.stringify([]));
  } catch {
    // ignore
  }
}

export function startRebalanceOrderStatusRunV0(args: {
  storage: Pick<Storage, "setItem"> | null | undefined;
  message?: string;
  meta?: RebalanceOrderStatusRunMetaV0;
}): { ok: true; run: RebalanceOrderStatusRunV0 } | { ok: false; error: string } {
  const t = nowIso();
  const run: RebalanceOrderStatusRunV0 = {
    schemaVersion: 1,
    runId: makeId("rebalance_run"),
    createdAt: t,
    updatedAt: t,
    state: "running",
    phase: "fetching_core",
    message: args.message,
    meta: normalizeMetaInputV0(args.meta),
    orders: [],
  };

  const saved = saveRebalanceOrderStatusRunV0(args.storage, run);
  if (!saved.ok) return saved;

  return { ok: true, run };
}

export function attachOrdersToRebalanceRunV0(args: {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  runId: string;
  orders: unknown;
  message?: string;
}): { ok: true; run: RebalanceOrderStatusRunV0 } | { ok: false; error: string } {
  if (!args.storage) return { ok: false, error: "missing storage" };

  const prev = loadRebalanceOrderStatusRunV0(args.storage);
  if (!prev || prev.runId !== args.runId) return { ok: false, error: "missing or stale runId" };

  const normalized: ExecutionOrder[] = Array.isArray(args.orders)
    ? (args.orders as any[])
        .filter(Boolean)
        .map((o: any) => {
          const symbol = String(o?.symbol ?? "").trim();
          const sideRaw = String(o?.side ?? "").trim();
          const side: "BUY" | "SELL" | null = sideRaw === "BUY" ? "BUY" : sideRaw === "SELL" ? "SELL" : null;
          const notional = Number(o?.notional ?? NaN);
          if (!symbol || !side || !Number.isFinite(notional)) return null;
          return { symbol, side, notional } as ExecutionOrder;
        })
        .filter((o): o is ExecutionOrder => !!o)
    : [];

  const t = nowIso();
  const run: RebalanceOrderStatusRunV0 = {
    ...prev,
    updatedAt: t,
    phase: "executing",
    message: args.message ?? prev.message,
    orders: normalized.map((o, i) => ({
      id: String(i + 1),
      symbol: o.symbol,
      side: o.side,
      notional: o.notional,
      status: "queued",
      filledNotional: 0,
      fillPct01: 0,
      updatedAt: t,
    })),
  };

  const saved = saveRebalanceOrderStatusRunV0(args.storage, run);
  if (!saved.ok) return saved;
  return { ok: true, run };
}

export function updateRebalanceOrderStatusV0(args: {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  runId: string;
  orderId: string;
  status: OrderStatusV0;
  filledNotional?: number;
  fillPct01?: number;
  detail?: string;
  phase?: RebalanceOrderStatusRunPhaseV0;
}): { ok: true; run: RebalanceOrderStatusRunV0 } | { ok: false; error: string } {
  if (!args.storage) return { ok: false, error: "missing storage" };

  const prev = loadRebalanceOrderStatusRunV0(args.storage);
  if (!prev || prev.runId !== args.runId) return { ok: false, error: "missing or stale runId" };

  const t = nowIso();
  const nextOrders = prev.orders.map((o) => {
    if (o.id !== args.orderId) return o;
    const detail = args.detail === undefined ? o.detail : args.detail;

    const filledNotional =
      args.filledNotional === undefined
        ? o.filledNotional
        : Number.isFinite(args.filledNotional) && args.filledNotional >= 0
          ? args.filledNotional
          : o.filledNotional;

    const fillPct01 =
      args.fillPct01 === undefined
        ? o.fillPct01
        : Number.isFinite(args.fillPct01)
          ? Math.max(0, Math.min(1, args.fillPct01))
          : o.fillPct01;

    return {
      ...o,
      status: args.status,
      updatedAt: t,
      detail,
      ...(filledNotional === undefined ? {} : { filledNotional }),
      ...(fillPct01 === undefined ? {} : { fillPct01 }),
    };
  });

  const run: RebalanceOrderStatusRunV0 = {
    ...prev,
    updatedAt: t,
    phase: args.phase ? normalizePhaseV0(args.phase) : prev.phase,
    orders: nextOrders,
  };

  const saved = saveRebalanceOrderStatusRunV0(args.storage, run);
  if (!saved.ok) return saved;
  return { ok: true, run };
}

export function finishRebalanceOrderStatusRunV0(args: {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  runId: string;
  phase?: RebalanceOrderStatusRunPhaseV0;
  message?: string;
}): { ok: true; run: RebalanceOrderStatusRunV0 } | { ok: false; error: string } {
  if (!args.storage) return { ok: false, error: "missing storage" };

  const prev = loadRebalanceOrderStatusRunV0(args.storage);
  if (!prev || prev.runId !== args.runId) return { ok: false, error: "missing or stale runId" };

  const t = nowIso();
  const run: RebalanceOrderStatusRunV0 = {
    ...prev,
    updatedAt: t,
    state: "done",
    phase: args.phase ? normalizePhaseV0(args.phase) : "done",
    message: args.message ?? prev.message,
    error: undefined,
  };

  const saved = saveRebalanceOrderStatusRunV0(args.storage, run);
  if (!saved.ok) return saved;

  // Best-effort: keep a rolling history so runs can be inspected after the snapshot is cleared.
  upsertRebalanceOrderStatusRunHistoryV0({ storage: args.storage, run });

  return { ok: true, run };
}

export function failRebalanceOrderStatusRunV0(args: {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  runId: string;
  error: string;
  message?: string;
}): { ok: true; run: RebalanceOrderStatusRunV0 } | { ok: false; error: string } {
  if (!args.storage) return { ok: false, error: "missing storage" };

  const prev = loadRebalanceOrderStatusRunV0(args.storage);
  if (!prev || prev.runId !== args.runId) return { ok: false, error: "missing or stale runId" };

  const t = nowIso();
  const run: RebalanceOrderStatusRunV0 = {
    ...prev,
    updatedAt: t,
    state: "error",
    phase: "error",
    message: args.message ?? prev.message,
    error: String(args.error || "unknown error"),
  };

  const saved = saveRebalanceOrderStatusRunV0(args.storage, run);
  if (!saved.ok) return saved;

  // Best-effort: keep a rolling history so runs can be inspected after the snapshot is cleared.
  upsertRebalanceOrderStatusRunHistoryV0({ storage: args.storage, run });

  return { ok: true, run };
}

export function setRebalanceOrderStatusRunMetaV0(args: {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  runId: string;
  meta: RebalanceOrderStatusRunMetaV0 | null | undefined;
}): { ok: true; run: RebalanceOrderStatusRunV0 } | { ok: false; error: string } {
  if (!args.storage) return { ok: false, error: "missing storage" };

  const runId = String(args.runId ?? "").trim();
  if (!runId) return { ok: false, error: "missing runId" };

  // Prefer the snapshot if it matches, otherwise fall back to the rolling history.
  const snap = loadRebalanceOrderStatusRunV0(args.storage);
  const hist = loadRebalanceOrderStatusRunHistoryV0(args.storage);
  const base = snap && snap.runId === runId ? snap : hist.find((r) => r.runId === runId) ?? null;
  if (!base) return { ok: false, error: "runId not found" };

  const t = nowIso();
  const meta = normalizeMetaInputV0(args.meta);

  const run: RebalanceOrderStatusRunV0 = {
    ...base,
    updatedAt: t,
    meta,
  };

  if (snap && snap.runId === runId) {
    const saved = saveRebalanceOrderStatusRunV0(args.storage, run);
    if (!saved.ok) return saved;
  }

  upsertRebalanceOrderStatusRunHistoryV0({ storage: args.storage, run });
  return { ok: true, run };
}
