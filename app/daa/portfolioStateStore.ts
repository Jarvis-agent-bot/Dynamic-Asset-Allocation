"use client";

import { appendRebalanceLog } from "@/src/daa/rebalanceLogStore";
import type { TaxLotV0 } from "@/src/daa/taxLotsImpactV0";
import {
  DAA_RUNTIME_DATA_EVENT_V1,
  loadUnifiedPortfolioStateV1,
  saveUnifiedPortfolioStateV1,
} from "./unifiedInputStore";

// Portfolio state (v0): positions + cash + lastRebalance.
// Canonical storage is unifiedInputStore.

// 历史 key（仅保留给测试和迁移说明，不再用于读写）。
export const LS_PORTFOLIO_STATE = "daa.portfolio.state";
const LEGACY_HOLDINGS_KEY = "holdings";

export type PortfolioStateV1 = {
  schemaVersion: 1;
  updatedAt: string;
  positions: Record<string, { qty: number; cost?: number; lots?: TaxLotV0[] }>;
  cash: number;
  lastRebalance?: {
    at: string;
    kind: "simulate" | "core";
    request?: unknown;
    response?: unknown;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function toFiniteNumber(x: unknown, fallback: number) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function defaultStateV1(): PortfolioStateV1 {
  return { schemaVersion: 1, updatedAt: nowIso(), positions: {}, cash: 0 };
}

function normalizeTaxLotsV0(x: unknown): TaxLotV0[] {
  if (!Array.isArray(x)) return [];
  const out: TaxLotV0[] = [];

  for (const it of x) {
    if (!it || typeof it !== "object" || Array.isArray(it)) continue;
    const r: any = it as any;

    const qty = toFiniteNumber(r.qty, NaN);
    const cost = toFiniteNumber(r.cost, NaN);

    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(cost) || cost < 0) continue;

    const acquiredAtRaw = r.acquiredAt;
    const acquiredAt = typeof acquiredAtRaw === "string" && acquiredAtRaw.trim() ? acquiredAtRaw.trim() : undefined;

    out.push(acquiredAt ? { qty, cost, acquiredAt } : { qty, cost });
  }

  return out;
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

    const lots = normalizeTaxLotsV0(vv?.lots);

    out[sym] = {
      qty,
      ...(cost === undefined ? {} : { cost }),
      ...(lots.length ? { lots } : {}),
    };
  }

  return out;
}

function readStateFromLs(): PortfolioStateV1 | null {
  const fromUnified = loadUnifiedPortfolioStateV1();
  if (fromUnified && typeof fromUnified === "object" && !Array.isArray(fromUnified)) {
    const r: any = fromUnified as any;
    if (r.schemaVersion === 1) {
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
  }

  return null;
}

export function loadPortfolioStateV1(): PortfolioStateV1 {
  const existing = readStateFromLs();
  if (existing) return existing;
  return defaultStateV1();
}

export function savePortfolioStateV1(state: PortfolioStateV1) {
  if (typeof window === "undefined") return;
  try {
    saveUnifiedPortfolioStateV1(state, { dispatchEvent: false });

    // 彻底下线历史 holdings key。
    window.localStorage.removeItem(LEGACY_HOLDINGS_KEY);
  } catch {
    // ignore
  }
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

export function recordPortfolioLastRebalance(args: {
  kind: "simulate" | "core";
  runId?: string;
  request: unknown;
  response: unknown;
  logNote?: string;
}) {
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
    runId: args.runId,
    request: args.request,
    response: args.response,
    note: args.logNote || "portfolio.lastRebalance",
  });

  // Trigger UI refresh in the same tab (storage events don't fire locally).
  window.dispatchEvent(new CustomEvent(DAA_RUNTIME_DATA_EVENT_V1));
}
