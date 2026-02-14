import { describe, expect, it } from "vitest";

import { applyNotionalOrdersToPositionsV0 } from "../portfolioApplyNotionalOrdersV0";

describe("daa/portfolioApplyNotionalOrdersV0", () => {
  it("applies BUY and SELL notionals using snapshot prices", () => {
    const r = applyNotionalOrdersToPositionsV0({
      cash: 1000,
      positions: { AAA: 1 },
      orders: [
        { symbol: "AAA", side: "BUY", notional: 100 },
        { symbol: "AAA", side: "SELL", notional: 50 },
      ],
      pricesBySymbol: { AAA: 10 },
    });

    // BUY 100 @ 10 => +10 qty; SELL 50 @ 10 => -5 qty
    expect(r.cashAfter).toBeCloseTo(950, 6);
    expect(r.positionsAfter.AAA).toBeCloseTo(6, 6);
    expect(r.issues.join("\n")).not.toMatch(/missing price/i);
  });

  it("skips orders when price is missing", () => {
    const r = applyNotionalOrdersToPositionsV0({
      cash: 100,
      positions: { AAA: 1 },
      orders: [{ symbol: "AAA", side: "BUY", notional: 50 }],
      pricesBySymbol: {},
    });

    expect(r.cashAfter).toBe(100);
    expect(r.positionsAfter.AAA).toBe(1);
    expect(r.issues.join("\n")).toMatch(/missing price/i);
  });

  it("clamps SELL beyond current position", () => {
    const r = applyNotionalOrdersToPositionsV0({
      cash: 0,
      positions: { AAA: 1 },
      orders: [{ symbol: "AAA", side: "SELL", notional: 100 }],
      pricesBySymbol: { AAA: 10 },
    });

    // Sell 100 @ 10 => -10 qty from 1 => clamp to 0.
    expect(r.positionsAfter.AAA).toBeUndefined();
    expect(r.cashAfter).toBeCloseTo(100, 6);
    expect(r.issues.join("\n")).toMatch(/clamped/i);
  });
});
