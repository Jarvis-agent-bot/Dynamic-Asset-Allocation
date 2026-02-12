"use client";

import { appendRebalanceLog } from "@/src/daa/rebalanceLogStore";

import { WIZARD_DATA_EVENT } from "./wizardStorage";

// Portfolio state (v0): positions + cash + lastRebalance.
// Stored in localStorage with an explicit schemaVersion for forward-compatible migrations.

export const LS_PORTFOLIO_STATE = "daa.portfolio.state";
export const LS_LEGACY_HOLDINGS = "holdings";

export type PortfolioStateV1 = {
  schemaVersion: 1;
  updatedAt: string;
  positions: Record<string, { qty: number; cost?: number }>;
  cash: number;
  lastRebalance?: {
    at: string;
    kind: "simulate" | "core";
    request?: unknown;
    response?: unknown;
  };
};

export type LegacyHoldings = Record<string, { share: number; cost: number }>;

function nowIso() {
  return new Date().toISOString();
}

function toFiniteNumber(x: unknown, fallback: number) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function defaultStateV1(): PortfolioStateV1 {
  return { schemaVersion: 1, updatedAt: nowIso(), positions: {}, cash: 0 };
}

function normalizePositions(x: unknown): PortfolioStateV1["positions"] {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const out: PortfolioStateV1["positions"] = {};

  for (const [symRaw, v] of Object.entries(x as Record<string, unknown>)) {
    const sym = String(symRaw ?? "").trim();
    if (!sym) continue;

    const vv: any = v as any;
    const qty = toFiniteNumber(vv?.qty, NaN);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const costNum = vv?.cost === undefined ? undefined : toFiniteNumber(vv.cost, NaN);
    const cost = costNum !== undefined && Number.isFinite(costNum) ? costNum : undefined;

    out[sym] = cost === undefined ? { qty } : { qty, cost };
  }

  return out;
}

function normalizeLegacyHoldings(x: unknown): LegacyHoldings {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const out: LegacyHoldings = {};

  for (const [codeRaw, v] of Object.entries(x as Record<string, unknown>)) {
    const code = String(codeRaw ?? "").trim();
    if (!code) continue;

    const vv: any = v as any;
    const share = toFiniteNumber(vv?.share, NaN);
    const cost = toFiniteNumber(vv?.cost, NaN);

    if (!Number.isFinite(share) || share <= 0) continue;
    out[code] = { share, cost: Number.isFinite(cost) ? cost : 0 };
  }

  return out;
}

function legacyHoldingsToPositions(holdings: LegacyHoldings): PortfolioStateV1["positions"] {
  const out: PortfolioStateV1["positions"] = {};
  for (const [code, h] of Object.entries(holdings)) {
    if (!h) continue;
    out[code] = h.cost ? { qty: h.share, cost: h.cost } : { qty: h.share };
  }
  return out;
}

function positionsToLegacyHoldings(positions: PortfolioStateV1["positions"]): LegacyHoldings {
  const out: LegacyHoldings = {};
  for (const [code, p] of Object.entries(positions ?? {})) {
    if (!p) continue;
    const share = toFiniteNumber((p as any).qty, NaN);
    if (!Number.isFinite(share) || share <= 0) continue;
    const costNum = (p as any).cost;
    const cost = costNum === undefined ? 0 : toFiniteNumber(costNum, 0);
    out[code] = { share, cost };
  }
  return out;
}

function readStateFromLs(): PortfolioStateV1 | null {
  if (typeof window === "undefined") return null;

  const raw = safeJsonParse(window.localStorage.getItem(LS_PORTFOLIO_STATE));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const r: any = raw as any;
  if (r.schemaVersion !== 1) return null;

  const positions = normalizePositions(r.positions);
  const cash = Math.max(0, toFiniteNumber(r.cash, 0));

  const lastRaw = r.lastRebalance;
  const last = (() => {
    if (!lastRaw || typeof lastRaw !== "object" || Array.isArray(lastRaw)) return undefined;
    const k = (lastRaw as any).kind;
    const kind = k === "core" ? "core" : k === "simulate" ? "simulate" : null;
    const at = String((lastRaw as any).at ?? "");
    if (!kind || !at) return undefined;
    return {
      at,
      kind,
      request: (lastRaw as any).request,
      response: (lastRaw as any).response,
    } as PortfolioStateV1["lastRebalance"];
  })();

  const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();

  return { schemaVersion: 1, updatedAt, positions, cash, lastRebalance: last };
}

export function loadPortfolioStateV1(): PortfolioStateV1 {
  // Prefer schemaVersioned state; otherwise migrate from legacy holdings.
  const existing = readStateFromLs();
  if (existing) return existing;

  if (typeof window === "undefined") return defaultStateV1();

  const legacy = normalizeLegacyHoldings(safeJsonParse(window.localStorage.getItem(LS_LEGACY_HOLDINGS)));
  if (Object.keys(legacy).length) {
    const next: PortfolioStateV1 = {
      schemaVersion: 1,
      updatedAt: nowIso(),
      positions: legacyHoldingsToPositions(legacy),
      cash: 0,
    };
    savePortfolioStateV1(next);
    return next;
  }

  return defaultStateV1();
}

export function savePortfolioStateV1(state: PortfolioStateV1) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_PORTFOLIO_STATE, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadLegacyHoldingsFromPortfolioState(): LegacyHoldings {
  const st = loadPortfolioStateV1();
  return positionsToLegacyHoldings(st.positions);
}

export function persistLegacyHoldingsToPortfolioState(holdings: LegacyHoldings) {
  if (typeof window === "undefined") return;

  // Keep legacy key for backward compatibility (and for export/import).
  try {
    window.localStorage.setItem(LS_LEGACY_HOLDINGS, JSON.stringify(holdings));
  } catch {
    // ignore
  }

  const st = loadPortfolioStateV1();
  const next: PortfolioStateV1 = {
    ...st,
    schemaVersion: 1,
    updatedAt: nowIso(),
    positions: legacyHoldingsToPositions(holdings),
  };
  savePortfolioStateV1(next);
}

function extractCashFromRebalanceRequest(req: unknown): number | null {
  if (!req || typeof req !== "object") return null;
  const r: any = req as any;

  const cash1 = r?.account?.cash;
  if (cash1 !== undefined) {
    const n = toFiniteNumber(cash1, NaN);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  const cash2 = r?.money_plan?.account?.cash;
  if (cash2 !== undefined) {
    const n = toFiniteNumber(cash2, NaN);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  return null;
}

export function recordPortfolioLastRebalance(args: { kind: "simulate" | "core"; request: unknown; response: unknown }) {
  if (typeof window === "undefined") return;

  const st = loadPortfolioStateV1();
  const cashMaybe = extractCashFromRebalanceRequest(args.request);

  const next: PortfolioStateV1 = {
    ...st,
    schemaVersion: 1,
    updatedAt: nowIso(),
    cash: cashMaybe === null ? st.cash : cashMaybe,
    lastRebalance: {
      at: nowIso(),
      kind: args.kind,
      request: args.request,
      response: args.response,
    },
  };

  savePortfolioStateV1(next);

  // Capture a rolling history so users can export/trace multiple runs.
  appendRebalanceLog({
    storage: window.localStorage,
    source: args.kind,
    request: args.request,
    response: args.response,
    note: "portfolio.lastRebalance",
  });

  // Trigger UI refresh in the same tab (storage events don't fire locally).
  window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
}
