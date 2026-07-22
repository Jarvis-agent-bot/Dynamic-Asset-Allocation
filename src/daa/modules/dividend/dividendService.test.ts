import { beforeEach, describe, expect, it, vi } from "vitest";

import { withDaaAccountScope } from "@/src/daa/account/accountScope";

const pgMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  daaPgPool: vi.fn(() => ({ query: pgMocks.query })),
  withDaaPgClient: vi.fn(),
}));

import { getDividendHoldingQtyOnExDate } from "@/src/daa/modules/dividend/dividendService";

describe("getDividendHoldingQtyOnExDate", () => {
  beforeEach(() => {
    pgMocks.query.mockReset();
  });

  it("按账户和除息日前的已执行成交回放持仓，不使用当前持仓", async () => {
    pgMocks.query.mockResolvedValue({ rows: [{ holding_qty: "0" }], rowCount: 1 });

    const qty = await withDaaAccountScope("acct-a", () => getDividendHoldingQtyOnExDate({
      symbol: "AAPL",
      market: "US",
      exDate: "2026-05-11",
    }));

    expect(qty).toBe(0);
    expect(pgMocks.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pgMocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM daa_trade_tickets");
    expect(sql).toContain("executed_at <");
    expect(sql).toContain("AT TIME ZONE");
    expect(params).toEqual(["acct-a", "AAPL", "US", "2026-05-11"]);
  });
});
