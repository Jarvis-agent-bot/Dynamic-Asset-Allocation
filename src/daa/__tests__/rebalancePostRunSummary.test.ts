import { describe, expect, it } from "vitest";

import { buildRebalancePostRunSummaryV0 } from "../rebalancePostRunSummary";

describe("buildRebalancePostRunSummaryV0", () => {
  it("reports full target fill for a perfect rebalance", () => {
    const r = buildRebalancePostRunSummaryV0({
      cashStart: 0,
      valuesBySymbol: { AAA: 100 },
      targetWeightsBySymbol: { BBB: 1 },
      orders: [
        { symbol: "AAA", side: "SELL", notional: 100 },
        { symbol: "BBB", side: "BUY", notional: 100 },
      ],
      feeBps: 0,
      slippageBps: 0,
    });

    expect(r.ordersCount).toBe(2);
    expect(r.targetFillPct01).not.toBeNull();
    expect(r.targetFillPct01).toBeCloseTo(1, 9);

    expect(r.maxAbsDriftAfterPct01).toBeCloseTo(0, 9);
  });

  it("accounts for fees/slippage reducing fill", () => {
    const r = buildRebalancePostRunSummaryV0({
      cashStart: 0,
      valuesBySymbol: { AAA: 100 },
      targetWeightsBySymbol: { BBB: 1 },
      orders: [
        { symbol: "AAA", side: "SELL", notional: 100 },
        { symbol: "BBB", side: "BUY", notional: 100 },
      ],
      feeBps: 100,
      slippageBps: 0,
    });

    expect(r.targetFillPct01).not.toBeNull();
    expect((r.targetFillPct01 as number) < 1).toBe(true);
  });
});
