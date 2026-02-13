export const LS_REBALANCE_LOG_V0 = "daa.rebalance.log.v0";

export type RebalanceLogSource = "simulate" | "core";

export type RebalanceOrder = {
  symbol: string;
  side: "BUY" | "SELL";
  notional: number;
  reason?: string;
};

export type RebalanceLogEntryV0 = {
  id: string;
  runId?: string;
  at: string; // ISO timestamp
  kind: "rebalance";
  source: RebalanceLogSource;
  request?: unknown;
  response?: unknown;
  orders: RebalanceOrder[];
  note?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return String(c.randomUUID());
  return `rebalance_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeOrders(x: unknown): RebalanceOrder[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((o: any) => {
      const symbol = String(o?.symbol ?? "").trim();
      const sideRaw = String(o?.side ?? "").trim().toUpperCase();
      const side: RebalanceOrder["side"] | null = sideRaw === "BUY" ? "BUY" : sideRaw === "SELL" ? "SELL" : null;
      const notional = Number(o?.notional ?? NaN);
      const reason = o?.reason === undefined ? undefined : String(o.reason);

      if (!symbol || !side || !Number.isFinite(notional)) return null;

      const base: RebalanceOrder = { symbol, side, notional };
      return reason === undefined ? base : { ...base, reason };
    })
    .filter((o): o is RebalanceOrder => !!o);
}

function normalizeEntry(x: unknown): RebalanceLogEntryV0 | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e: any = x as any;

  const id = String(e?.id ?? "").trim();
  const at = String(e?.at ?? "").trim();
  const kind = e?.kind === "rebalance" ? "rebalance" : null;
  const src = e?.source === "core" || e?.source === "simulate" ? (e.source as RebalanceLogSource) : null;
  if (!id || !at || !kind || !src) return null;

  const orders = normalizeOrders(e?.orders);
  const runId = typeof e.runId === "string" && e.runId.trim() ? e.runId.trim() : undefined;

  const out: RebalanceLogEntryV0 = {
    id,
    at,
    kind,
    source: src,
    orders,
  };

  if (runId) out.runId = runId;
  if (e.request !== undefined) out.request = e.request;
  if (e.response !== undefined) out.response = e.response;
  if (e.note !== undefined) out.note = String(e.note);

  return out;
}

export function loadRebalanceLog(storage: Pick<Storage, "getItem"> | null | undefined): RebalanceLogEntryV0[] {
  if (!storage) return [];
  const raw = safeJsonParse(storage.getItem(LS_REBALANCE_LOG_V0));
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEntry).filter((e): e is RebalanceLogEntryV0 => !!e);
}

function extractOrdersFromResponse(resp: unknown): unknown {
  if (!resp || typeof resp !== "object") return [];
  const r: any = resp as any;
  return r.orders ?? r?.result?.orders;
}

export function appendRebalanceLog(args: {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  source: RebalanceLogSource;
  runId?: string;
  request?: unknown;
  response?: unknown;
  note?: string;
  at?: string;
  maxEntries?: number;
}): { ok: true; entry: RebalanceLogEntryV0; log: RebalanceLogEntryV0[] } | { ok: false; error: string } {
  if (!args.storage) return { ok: false, error: "missing storage" };

  const runId = typeof args.runId === "string" && args.runId.trim() ? args.runId.trim() : undefined;

  const entry: RebalanceLogEntryV0 = {
    id: makeId(),
    runId,
    at: typeof args.at === "string" && args.at ? args.at : nowIso(),
    kind: "rebalance",
    source: args.source,
    request: args.request,
    response: args.response,
    orders: normalizeOrders(extractOrdersFromResponse(args.response)),
    note: args.note,
  };

  const prev = loadRebalanceLog(args.storage);
  const max = Number.isFinite(args.maxEntries) && (args.maxEntries as number) > 0 ? (args.maxEntries as number) : 200;
  const next = [...prev, entry].slice(-max);

  try {
    args.storage.setItem(LS_REBALANCE_LOG_V0, JSON.stringify(next));
    return { ok: true, entry, log: next };
  } catch {
    return { ok: false, error: "failed to persist rebalance log" };
  }
}

export function clearRebalanceLog(storage: Pick<Storage, "setItem"> | null | undefined) {
  if (!storage) return;
  try {
    storage.setItem(LS_REBALANCE_LOG_V0, JSON.stringify([]));
  } catch {
    // ignore
  }
}
