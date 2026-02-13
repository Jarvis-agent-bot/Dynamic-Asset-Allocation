import { describe, expect, it } from "vitest";

import { estimateTotalBrokerageFeesV0 } from "../feeEstimateV0";

describe("estimateTotalBrokerageFeesV0", () => {
  it("estimates fees as turnoverNotional * feeBps / 10000", () => {
    const fee = estimateTotalBrokerageFeesV0({
      orders: [{ notional: 100 }, { notional: 50.5 }],
      feeBps: 10,
    });

    // turnover=150.5, feeBps=10 => 150.5*0.001
    expect(fee).toBeCloseTo(0.1505, 10);
  });

  it("returns null when feeBps is missing/invalid/non-positive", () => {
    expect(estimateTotalBrokerageFeesV0({ orders: [{ notional: 100 }], feeBps: null })).toBe(null);
    expect(estimateTotalBrokerageFeesV0({ orders: [{ notional: 100 }], feeBps: "" })).toBe(null);
    expect(estimateTotalBrokerageFeesV0({ orders: [{ notional: 100 }], feeBps: 0 })).toBe(null);
    expect(estimateTotalBrokerageFeesV0({ orders: [{ notional: 100 }], feeBps: -1 })).toBe(null);
  });

  it("ignores non-finite or non-positive notionals", () => {
    const fee = estimateTotalBrokerageFeesV0({
      orders: [{ notional: 100 }, { notional: 0 }, { notional: -5 }, { notional: Number.NaN }, { notional: "x" }],
      feeBps: 10,
    });

    expect(fee).toBeCloseTo(0.1, 10);
  });
});
