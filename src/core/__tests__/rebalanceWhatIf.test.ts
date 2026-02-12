import { describe, expect, it } from "vitest";

import { simulateRebalanceWhatIfV0 } from "../rebalanceWhatIf";

describe("rebalanceWhatIf", () => {
  it("applies fees+slippage as a percent of notional and conserves totals", () => {
    const res = simulateRebalanceWhatIfV0({
      cashStart: 100,
      valuesBySymbol: { AAA: 50, BBB: 50 },
      targetWeightsBySymbol: { AAA: 0.5, BBB: 0.5 },
      orders: [
        { symbol: "AAA", side: "BUY", notional: 10 },
        { symbol: "BBB", side: "SELL", notional: 10 },
      ],
      feeBps: 50,
      slippageBps: 50,
    });

    expect(res.schemaVersion).toBe(1);
    expect(res.costPct).toBeCloseTo(0.01, 10);
    expect(res.costTotal).toBeCloseTo(0.2, 10);

    // totalAfter = totalBefore - costTotal
    expect(res.totalBefore - res.totalAfter).toBeCloseTo(res.costTotal, 10);

    // BUY reduces acquired value; SELL reduces cash received.
    const byId = new Map(res.rows.map((r) => [r.id, r] as const));
    expect(byId.get("AAA")?.valueAfter).toBeCloseTo(59.9, 10);
    expect(byId.get("BBB")?.valueAfter).toBeCloseTo(40, 10);

    expect(res.cashAfter).toBeCloseTo(99.9, 10);
  });

  it("warns on insufficient cash", () => {
    const res = simulateRebalanceWhatIfV0({
      cashStart: 0,
      valuesBySymbol: { AAA: 100 },
      targetWeightsBySymbol: { AAA: 1 },
      orders: [{ symbol: "AAA", side: "BUY", notional: 10 }],
      feeBps: 0,
      slippageBps: 0,
    });

    expect(res.cashAfter).toBe(-10);
    expect(res.warnings.join("\n")).toMatch(/cashAfter < 0/);
  });
});
