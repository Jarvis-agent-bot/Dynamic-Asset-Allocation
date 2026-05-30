import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/modules/marketCache/priceSeriesCache", () => ({
  fetchPriceSeriesWithCache: vi.fn(),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  withDaaPgClient: vi.fn(async (fn: (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => fn({
    query: vi.fn(async () => ({ rows: [] })),
  })),
}));

vi.mock("@/src/core/backtestDriftRebalance", () => ({
  backtestDriftRebalance: vi.fn(() => ({
    warnings: [],
    metrics: {
      totalReturn: 0,
      annualizedReturn: 0,
      annualizedVolatility: 0,
      sharpe: 0,
      maxDrawdown: 0,
      calmar: 0,
      winRate: 0,
      turnover: 0,
    },
    dates: ["2026-01-01", "2026-01-02"],
    equity: [1, 1],
    dailyReturns: [0],
    events: [],
    portfolioByDate: [],
    timeline: [],
  })),
}));

vi.mock("@/src/core/backtest/attribution", () => ({
  computeBacktestAttribution: vi.fn(() => ({
    portfolioReturn: 0,
    benchmark: { symbol: "SPY", return: 0, coverage: "full" },
    activeReturn: 0,
    bySymbol: [],
  })),
}));

import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { backtestDriftRebalance } from "@/src/core/backtestDriftRebalance";
import { runStrategyLabBacktest } from "@/src/daa/modules/strategyLab/strategyLabService";

function buildSeries(prices: number[]) {
  return prices.map((close, index) => ({
    date: `2026-01-0${index + 1}`,
    close,
  }));
}

describe("strategyLabService minOrderNotional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("将调用方的最小下单额透传给回测核心，而不是硬编码 50", async () => {
    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: buildSeries([100, 101]),
      source: "db",
    }));

    await runStrategyLabBacktest({
      assets: ["US::SPY"],
      strategies: ["equalWeight"],
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      benchmarkSymbol: "SPY",
      minOrderNotional: 0,
    } as never);

    expect(vi.mocked(backtestDriftRebalance)).toHaveBeenCalledWith(expect.objectContaining({
      trigger: expect.objectContaining({
        minOrderNotional: 0,
      }),
    }));
  });
});
