import { simulateRebalanceWhatIfV0, type WhatIfOrderV0 } from "../core/rebalanceWhatIf";

export type AllocationDiffRowV0 = {
  id: string;
  label: string;
  beforePct01: number;
  afterPct01: number;
  targetPct01: number;
};

export type RebalancePostRunSummaryV0 = {
  schemaVersion: 1;
  ordersCount: number;

  // Turnover (buy+sell). This is useful to sanity-check that the run used the intended orders.
  turnoverNotional: number;
  turnoverPctOfTotalBefore01: number | null;

  // 0..1 where 1 means perfectly matches target (based on sumAbsDrift).
  targetFillPct01: number | null;

  // Sum of absolute drift vs target (including cash) before/after.
  sumAbsDriftBeforePct01: number | null;
  sumAbsDriftAfterPct01: number | null;
  maxAbsDriftBeforePct01: number | null;
  maxAbsDriftAfterPct01: number | null;

  warnings: string[];

  // For UI: per-symbol (and cash) allocation before vs after so we can render a diff chart.
  allocationDiffRowsV0: AllocationDiffRowV0[];
};

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function safeDiv(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

export function buildRebalancePostRunSummaryV0(args: {
  cashStart: number;
  valuesBySymbol: Record<string, number>;
  targetWeightsBySymbol: Record<string, number>;
  orders: unknown;
  feeBps?: number;
  slippageBps?: number;
  labelsBySymbol?: Record<string, string>;
}): RebalancePostRunSummaryV0 {
  const feeBps = toFiniteNumber(args.feeBps) ?? 0;
  const slippageBps = toFiniteNumber(args.slippageBps) ?? 0;

  const rawOrders = Array.isArray(args.orders) ? args.orders : [];
  const orders: WhatIfOrderV0[] = rawOrders
    .filter(Boolean)
    .map((o: any) => {
      const symbol = String(o?.symbol ?? "").trim();
      const sideRaw = String(o?.side ?? "").trim().toUpperCase();
      const side = sideRaw === "BUY" || sideRaw === "SELL" ? (sideRaw as "BUY" | "SELL") : null;
      const notional = Number(o?.notional ?? 0);
      if (!symbol || !side || !Number.isFinite(notional) || notional <= 0) return null;
      return { symbol, side, notional };
    })
    .filter((o): o is WhatIfOrderV0 => !!o);

  const whatIf = simulateRebalanceWhatIfV0({
    cashStart: toFiniteNumber(args.cashStart) ?? 0,
    valuesBySymbol: args.valuesBySymbol ?? {},
    targetWeightsBySymbol: args.targetWeightsBySymbol ?? {},
    orders,
    feeBps,
    slippageBps,
    labelsBySymbol: args.labelsBySymbol,
  });

  // Include cash in drift aggregation (cash target is the residual after summing asset weights).
  const sumTarget = Object.values(args.targetWeightsBySymbol ?? {}).reduce((acc, wRaw) => {
    const w = toFiniteNumber(wRaw);
    if (w === null) return acc;
    return acc + w;
  }, 0);

  const targetCashPct = Math.max(0, 1 - sumTarget);

  const cashBeforePct = safeDiv(whatIf.cashBefore, whatIf.totalBefore);
  const cashAfterPct = safeDiv(whatIf.cashAfter, whatIf.totalAfter);

  const cashDriftBeforePct = cashBeforePct - targetCashPct;
  const cashDriftAfterPct = cashAfterPct - targetCashPct;

  let sumAbsBefore = Math.abs(cashDriftBeforePct);
  let sumAbsAfter = Math.abs(cashDriftAfterPct);

  let maxAbsBefore = Math.abs(cashDriftBeforePct);
  let maxAbsAfter = Math.abs(cashDriftAfterPct);

  for (const r of whatIf.rows) {
    const driftBefore = (toFiniteNumber(r.currentPct) ?? 0) - (toFiniteNumber(r.targetPct) ?? 0);
    const driftAfter = toFiniteNumber(r.driftPct) ?? 0;

    sumAbsBefore += Math.abs(driftBefore);
    sumAbsAfter += Math.abs(driftAfter);

    maxAbsBefore = Math.max(maxAbsBefore, Math.abs(driftBefore));
    maxAbsAfter = Math.max(maxAbsAfter, Math.abs(driftAfter));
  }

  const targetFillPct01 = sumAbsBefore > 1e-12 ? clamp01(1 - sumAbsAfter / sumAbsBefore) : null;

  const turnoverPctOfTotalBefore01 = whatIf.totalBefore > 0 ? whatIf.turnoverNotional / whatIf.totalBefore : null;

  const allocationDiffRowsV0: AllocationDiffRowV0[] = [
    {
      id: "CASH",
      label: "Cash",
      beforePct01: clamp01(cashBeforePct),
      afterPct01: clamp01(cashAfterPct),
      targetPct01: clamp01(targetCashPct),
    },
    ...whatIf.rows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      beforePct01: clamp01(toFiniteNumber(r.currentPct) ?? 0),
      afterPct01: clamp01(toFiniteNumber(r.postPct) ?? 0),
      targetPct01: clamp01(toFiniteNumber(r.targetPct) ?? 0),
    })),
  ];

  // Sort by absolute allocation change so the chart highlights the biggest diffs.
  allocationDiffRowsV0.sort((a, b) => Math.abs(b.afterPct01 - b.beforePct01) - Math.abs(a.afterPct01 - a.beforePct01));

  return {
    schemaVersion: 1,
    ordersCount: orders.length,

    turnoverNotional: whatIf.turnoverNotional,
    turnoverPctOfTotalBefore01,

    targetFillPct01,
    sumAbsDriftBeforePct01: sumAbsBefore,
    sumAbsDriftAfterPct01: sumAbsAfter,
    maxAbsDriftBeforePct01: maxAbsBefore,
    maxAbsDriftAfterPct01: maxAbsAfter,
    warnings: whatIf.warnings,

    allocationDiffRowsV0,
  };
}
