import { simulateRebalanceWhatIfV0, type WhatIfOrderV0 } from "../core/rebalanceWhatIf";

export type PreTradeCashCheckV0 = {
  schemaVersion: 1;

  cashStart: number;
  buyNotional: number;
  sellNotional: number;
  cashAfter: number;

  // When true, UI should block recording/executing the rebalance until the user fixes inputs.
  blocking: boolean;
  reasons: string[];

  // Human-friendly summary for UI.
  message: string;
};

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeOrders(raw: unknown): WhatIfOrderV0[] {
  if (!Array.isArray(raw)) return [];

  const out: WhatIfOrderV0[] = [];
  for (const o of raw) {
    const sym = String((o as any)?.symbol ?? "").trim();
    const side = String((o as any)?.side ?? "").toUpperCase();
    const notional = toFiniteNumber((o as any)?.notional);

    if (!sym) continue;
    if (side !== "BUY" && side !== "SELL") continue;
    if (notional === null || notional <= 0) continue;

    out.push({ symbol: sym, side: side as "BUY" | "SELL", notional });
  }

  return out;
}

export function getPreTradeCashCheckV0(args: {
  cashStart: unknown;
  orders: unknown;
  feeBps?: unknown;
  slippageBps?: unknown;
  baseCcy?: string | null;
}): PreTradeCashCheckV0 {
  const cashStart = Math.max(0, toFiniteNumber(args.cashStart) ?? 0);
  const orders = normalizeOrders(args.orders);

  const feeBps = toFiniteNumber(args.feeBps) ?? 0;
  const slippageBps = toFiniteNumber(args.slippageBps) ?? 0;

  let buyNotional = 0;
  let sellNotional = 0;
  for (const o of orders) {
    if (o.side === "BUY") buyNotional += o.notional;
    else sellNotional += o.notional;
  }

  // Cash after depends on fees/slippage on SELL leg (BUY costs reduce acquired asset value, not cash spent).
  const sim = simulateRebalanceWhatIfV0({
    cashStart,
    valuesBySymbol: {},
    targetWeightsBySymbol: {},
    orders,
    feeBps,
    slippageBps,
  });

  const reasons: string[] = [];

  // Conservative settlement assumption for mutual funds / T+1/T+2 products: sell proceeds are not usable same-day.
  if (buyNotional > cashStart + 1e-6) {
    reasons.push("buyNotional_exceeds_settled_cash");
  }

  if (sim.cashAfter < -1e-6) {
    reasons.push("cashAfter_negative");
  }

  const blocking = reasons.length > 0;

  const ccy = args.baseCcy ? ` ${args.baseCcy}` : "";

  let message = `Pre-trade cash check: cashStart=${cashStart.toFixed(2)}${ccy}, buy=${buyNotional.toFixed(2)}${ccy}, sell=${sellNotional.toFixed(2)}${ccy}`;
  if (blocking) {
    const tail: string[] = [];
    if (reasons.includes("buyNotional_exceeds_settled_cash")) {
      tail.push(
        `BUY exceeds available cash. If sell proceeds settle later (T+1/T+2), split the rebalance (sell -> wait settlement -> buy) or add cash.`
      );
    }
    if (reasons.includes("cashAfter_negative")) {
      tail.push(`What-if cashAfter < 0 under fees/slippage; reduce BUY or increase cash.`);
    }
    message = `${message}. BLOCKED: ${tail.join(" ")}`;
  }

  return {
    schemaVersion: 1,
    cashStart,
    buyNotional,
    sellNotional,
    cashAfter: sim.cashAfter,
    blocking,
    reasons,
    message,
  };
}
