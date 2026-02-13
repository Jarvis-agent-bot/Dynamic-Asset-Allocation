import { describe, expect, it } from "vitest";

import { getPreTradeCashCheckV0 } from "../preTradeCashCheckV0";

describe("pre-trade cash/settlement check v0", () => {
  it("blocks when BUY notional exceeds starting cash (sell proceeds assumed not settled)", () => {
    const c = getPreTradeCashCheckV0({
      cashStart: 0,
      orders: [
        { side: "SELL", symbol: "AAA", notional: 100 },
        { side: "BUY", symbol: "BBB", notional: 100 },
      ],
      feeBps: 0,
      slippageBps: 0,
      baseCcy: "CNY",
    });

    expect(c.blocking).toBe(true);
    expect(c.reasons).toContain("buyNotional_exceeds_settled_cash");
    expect(c.buyNotional).toBe(100);
    expect(c.sellNotional).toBe(100);
    expect(c.message).toMatch(/BLOCKED/);
  });

  it("does not block when cashStart covers BUY notional", () => {
    const c = getPreTradeCashCheckV0({
      cashStart: 100,
      orders: [{ side: "BUY", symbol: "BBB", notional: 90 }],
      feeBps: 0,
      slippageBps: 0,
    });

    expect(c.blocking).toBe(false);
    expect(c.reasons).toEqual([]);
  });

  it("includes cashAfter_negative when BUY exceeds cashStart", () => {
    const c = getPreTradeCashCheckV0({
      cashStart: 10,
      orders: [{ side: "BUY", symbol: "BBB", notional: 20 }],
      feeBps: 0,
      slippageBps: 0,
    });

    expect(c.blocking).toBe(true);
    expect(c.reasons).toContain("cashAfter_negative");
  });
});
