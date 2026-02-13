import { describe, expect, it } from "vitest";

import { estimateTaxLotsImpactV0 } from "../taxLotsImpactV0";

describe("taxLotsImpactV0", () => {
  it("estimates realized gain using FIFO tax lots", () => {
    const res = estimateTaxLotsImpactV0({
      orders: [{ symbol: "AAA", side: "SELL", notional: 100 }],
      pricesBySymbol: { AAA: 10 },
      positionsBySymbol: {
        AAA: {
          qty: 10,
          lots: [
            { qty: 5, cost: 8, acquiredAt: "2025-01-01" },
            { qty: 5, cost: 12, acquiredAt: "2025-02-01" },
          ],
        },
      },
      costBps: 0,
    });

    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(1);

    const r = res.rows[0];
    expect(r.symbol).toBe("AAA");
    expect(r.qtyEst).toBeCloseTo(10, 8);
    expect(r.proceedsNet).toBeCloseTo(100, 8);
    expect(r.costBasisKnown).toBeCloseTo(100, 8);
    expect(r.realizedGainKnown).toBeCloseTo(0, 8);
    expect(r.qtyUnknown).toBeCloseTo(0, 8);

    expect(res.totals.realizedGainKnown).toBeCloseTo(0, 8);
  });

  it("falls back to avg cost when lots are missing", () => {
    const res = estimateTaxLotsImpactV0({
      orders: [{ symbol: "AAA", side: "SELL", notional: 100 }],
      pricesBySymbol: { AAA: 10 },
      positionsBySymbol: {
        AAA: { qty: 10, cost: 9 },
      },
      costBps: 0,
    });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].costBasisKnown).toBeCloseTo(90, 8);
    expect(res.rows[0].realizedGainKnown).toBeCloseTo(10, 8);
    expect(res.rows[0].qtyUnknown).toBeCloseTo(0, 8);
  });

  it("reports unknown cost basis when neither lots nor cost are available", () => {
    const res = estimateTaxLotsImpactV0({
      orders: [{ symbol: "AAA", side: "SELL", notional: 100 }],
      pricesBySymbol: { AAA: 10 },
      positionsBySymbol: {
        AAA: { qty: 10 },
      },
      costBps: 0,
    });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].qtyUnknown).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.includes("Missing cost basis"))).toBe(true);
  });

  it("applies costBps to net proceeds", () => {
    const res = estimateTaxLotsImpactV0({
      orders: [{ symbol: "AAA", side: "SELL", notional: 100 }],
      pricesBySymbol: { AAA: 10 },
      positionsBySymbol: {
        AAA: { qty: 10, cost: 9 },
      },
      costBps: 100, // 1%
    });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].proceedsNet).toBeCloseTo(99, 8);
    expect(res.rows[0].realizedGainKnown).toBeCloseTo(9, 8);
  });
});
