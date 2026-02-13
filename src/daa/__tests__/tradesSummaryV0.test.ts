import { describe, expect, it } from "vitest";

import { summarizeTradesForConfirmationV0 } from "../tradesSummaryV0";

describe("daa/tradesSummaryV0", () => {
  it("summarizeTradesForConfirmationV0 filters invalid trades and computes totals", () => {
    const s = summarizeTradesForConfirmationV0([
      { symbol: "AAA", side: "BUY", notional: 100 },
      { symbol: "BBB", side: "SELL", notional: 40 },
      { symbol: "CCC", side: "sell", notional: 10 },
      // ignore invalid
      { symbol: "", side: "BUY", notional: 1 },
      { symbol: "DDD", side: "HOLD", notional: 1 },
      { symbol: "EEE", side: "BUY", notional: 0 },
      { symbol: "FFF", side: "BUY", notional: Number.NaN },
    ] as any);

    expect(s.orderCount).toBe(7);
    expect(s.tradeCount).toBe(3);
    expect(s.buyCount).toBe(1);
    expect(s.sellCount).toBe(2);
    expect(s.buyNotional).toBe(100);
    expect(s.sellNotional).toBe(50);
    expect(s.turnoverNotional).toBe(150);
    expect(s.netNotional).toBe(50);

    expect(s.topTrades.map((t) => t.symbol)).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("summarizeTradesForConfirmationV0 topN=0 returns no topTrades", () => {
    const s = summarizeTradesForConfirmationV0([{ symbol: "AAA", side: "BUY", notional: 1 }], { topN: 0 });
    expect(s.tradeCount).toBe(1);
    expect(s.topTrades).toEqual([]);
  });
});
