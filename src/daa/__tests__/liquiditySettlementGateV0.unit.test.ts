import { describe, expect, it } from "vitest";

import { getLiquiditySettlementGateV0 } from "../liquiditySettlementGateV0";

describe("liquidity settlement gate v0", () => {
  it("blocks when T+N settlement means sells are not settled yet", () => {
    const gate = getLiquiditySettlementGateV0({
      settlementLagDays: 2,
      estimatedBuys: 100,
      estimatedSells: 100,
      availableCash: 0,
      baseCcy: "CNY",
    });

    expect(gate.blocked).toBe(true);
    expect(gate.cashGap).toBe(100);
    expect(gate.settledLiquidityCoverage).toBe(0);
    expect(gate.message).toMatch(/blocked/i);
    expect(gate.message).toMatch(/T\+2/);
  });

  it("passes when T+0 allows sell proceeds to cover buys", () => {
    const gate = getLiquiditySettlementGateV0({
      settlementLagDays: 0,
      estimatedBuys: 100,
      estimatedSells: 100,
      availableCash: 0,
    });

    expect(gate.blocked).toBe(false);
    expect(gate.cashGap).toBe(0);
    expect(gate.settledLiquidityCoverage).toBe(100);
  });
});
