import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/src/daa/pg/daaPg", () => ({
  withDaaPgClient: vi.fn(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) => fn({
    query: queryMock,
  })),
}));

import { listStrategyLabHistory } from "@/src/daa/modules/strategyLab/strategyLabService";

describe("strategyLab history mode filter", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("默认只返回组合再平衡回测历史，避免 breakout 记录污染历史面板", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          run_id: "rebalance-1",
          created_at: "2026-01-01T00:00:00.000Z",
          base_currency: "USD",
          start_date: "2026-01-01",
          end_date: "2026-01-31",
          request_json: {
            assets: ["US::SPY"],
            strategies: ["equalWeight"],
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            rebalanceFrequency: "monthly",
            initialCapital: 100000,
          },
          summary_json: {
            metrics: { totalReturn: 0.1, annualizedReturn: 0.1, annualizationFactor: 252, maxDrawdown: 0.02, sharpe: 1, winRate: 0.5 },
          },
        },
        {
          run_id: "breakout-1",
          created_at: "2026-01-02T00:00:00.000Z",
          base_currency: "USD",
          start_date: "2026-01-01",
          end_date: "2026-01-31",
          request_json: {
            mode: "breakout",
            assets: ["US::NVDA"],
          },
          summary_json: {
            mode: "breakout",
            aggregate: { trades: 3 },
          },
        },
      ],
    });

    const history = await listStrategyLabHistory(20);

    expect(history.map((item) => item.runId)).toEqual(["rebalance-1"]);
  });
});
