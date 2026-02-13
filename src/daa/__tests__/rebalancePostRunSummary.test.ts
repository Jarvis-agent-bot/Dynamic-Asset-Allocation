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
    expect(r.turnoverNotional).toBeCloseTo(200, 9);
    expect(r.turnoverPctOfTotalBefore01).toBeCloseTo(2, 9);

    expect(r.targetFillPct01).not.toBeNull();
    expect(r.targetFillPct01).toBeCloseTo(1, 9);

    expect(r.maxAbsDriftAfterPct01).toBeCloseTo(0, 9);

    // Allocation diff rows are used by the Funds hub post-run chart.
    const cash = r.allocationDiffRowsV0.find((x) => x.id === "CASH");
    const aaa = r.allocationDiffRowsV0.find((x) => x.id === "AAA");
    const bbb = r.allocationDiffRowsV0.find((x) => x.id === "BBB");

    expect(cash).toBeTruthy();
    expect(aaa).toBeTruthy();
    expect(bbb).toBeTruthy();

    expect(aaa?.beforePct01).toBeCloseTo(1, 9);
    expect(aaa?.afterPct01).toBeCloseTo(0, 9);
    expect(bbb?.beforePct01).toBeCloseTo(0, 9);
    expect(bbb?.afterPct01).toBeCloseTo(1, 9);
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
