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

export type RebalanceOrderStatusRunV0 = {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  updatedAt: string;
  state: "running" | "done" | "error";
  phase: RebalanceOrderStatusRunPhaseV0;
  message?: string;
  error?: string;
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
      const updatedAt = String(o?.updatedAt ?? "").trim();
      const detail = o?.detail === undefined ? undefined : String(o.detail);

      if (!id || !symbol || !side || !Number.isFinite(notional) || !updatedAt) return null;
      const base: RebalanceOrderStatusV0 = { id, symbol, side, notional, status, updatedAt };
      return detail === undefined ? base : { ...base, detail };
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

  return { schemaVersion: 1, runId, createdAt, updatedAt, state, phase, message, error, orders };
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
    return {
      ...o,
      status: args.status,
      updatedAt: t,
      detail,
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
