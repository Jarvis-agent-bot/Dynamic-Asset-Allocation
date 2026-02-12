export const LS_PAPER_EXECUTION_LOG_V0 = "daa.execution.log.v0";

export type ExecutionSide = "BUY" | "SELL";

export type ExecutionOrder = {
  symbol: string;
  side: ExecutionSide;
  notional: number;
  reason?: string;
};

export type PaperExecutionLogEntryV0 = {
  id: string;
  at: string; // ISO timestamp
  kind: "paper";
  source: "rebalance-simulate" | "rebalance-core";
  orders: ExecutionOrder[];
  note?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(): string {
  // Browser + Node 19+ typically support crypto.randomUUID().
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return String(c.randomUUID());
  return `paper_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeOrders(x: unknown): ExecutionOrder[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((o: any) => {
      const symbol = String(o?.symbol ?? "").trim();
      const sideRaw = String(o?.side ?? "").trim();
      const side: ExecutionSide | null = sideRaw === "BUY" ? "BUY" : sideRaw === "SELL" ? "SELL" : null;
      const notional = Number(o?.notional ?? NaN);
      const reason = o?.reason === undefined ? undefined : String(o.reason);

      if (!symbol || !side || !Number.isFinite(notional)) return null;

      const base: ExecutionOrder = { symbol, side, notional };
      return reason === undefined ? base : { ...base, reason };
    })
    .filter((o): o is ExecutionOrder => !!o);
}

function normalizeEntries(x: unknown): PaperExecutionLogEntryV0[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((e: any) => {
      const id = String(e?.id ?? "").trim();
      const at = String(e?.at ?? "").trim();
      const kind = e?.kind === "paper" ? "paper" : null;
      const src = e?.source === "rebalance-core" || e?.source === "rebalance-simulate" ? e.source : null;
      const orders = normalizeOrders(e?.orders);
      const note = e?.note === undefined ? undefined : String(e.note);

      if (!id || !at || !kind || !src) return null;
      return { id, at, kind, source: src, orders, note } as PaperExecutionLogEntryV0;
    })
    .filter((e): e is PaperExecutionLogEntryV0 => !!e);
}

export function loadPaperExecutionLog(storage: Pick<Storage, "getItem"> | null | undefined): PaperExecutionLogEntryV0[] {
  if (!storage) return [];
  const raw = safeJsonParse(storage.getItem(LS_PAPER_EXECUTION_LOG_V0));
  return normalizeEntries(raw);
}

export function appendPaperExecutionLog(args: {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  source: PaperExecutionLogEntryV0["source"];
  orders: unknown;
  note?: string;
  at?: string;
  maxEntries?: number;
}): { ok: true; entry: PaperExecutionLogEntryV0; log: PaperExecutionLogEntryV0[] } | { ok: false; error: string } {
  if (!args.storage) return { ok: false, error: "missing storage" };

  const orders = normalizeOrders(args.orders);
  if (!orders.length) return { ok: false, error: "no valid orders" };

  const entry: PaperExecutionLogEntryV0 = {
    id: makeId(),
    at: typeof args.at === "string" && args.at ? args.at : nowIso(),
    kind: "paper",
    source: args.source,
    orders,
    note: args.note,
  };

  const prev = loadPaperExecutionLog(args.storage);
  const max = Number.isFinite(args.maxEntries) && (args.maxEntries as number) > 0 ? (args.maxEntries as number) : 200;
  const next = [...prev, entry].slice(-max);

  try {
    args.storage.setItem(LS_PAPER_EXECUTION_LOG_V0, JSON.stringify(next));
    return { ok: true, entry, log: next };
  } catch {
    return { ok: false, error: "failed to persist execution log" };
  }
}

export function clearPaperExecutionLog(storage: Pick<Storage, "setItem"> | null | undefined) {
  if (!storage) return;
  try {
    storage.setItem(LS_PAPER_EXECUTION_LOG_V0, JSON.stringify([]));
  } catch {
    // ignore
  }
}
