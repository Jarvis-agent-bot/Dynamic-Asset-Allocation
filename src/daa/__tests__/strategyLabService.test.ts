import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/src/daa/modules/marketCache/priceSeriesCache", () => ({
  fetchPriceSeriesWithCache: vi.fn(),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  withDaaPgClient: vi.fn(async (fn: (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => fn({
    query: vi.fn(async () => ({ rows: [] })),
  })),
}));

import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { runStrategyLabBacktest, StrategyLabDomainError } from "@/src/daa/modules/strategyLab/strategyLabService";

function buildSeries(prices: number[]) {
  return prices.map((close, index) => ({
    date: `2026-01-0${index + 1}`,
    close,
  }));
}

function buildDatedSeries(points: Array<[string, number]>) {
  return points.map(([date, close]) => ({ date, close }));
}

describe("strategyLabService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("通过共享行情缓存执行多策略回测，并保留 MARKET::SYMBOL 资产键", async () => {
    const seriesByYfinanceSymbol: Record<string, ReturnType<typeof buildSeries>> = {
      SPY: buildSeries([100, 101, 102, 103, 104]),
      "0700.HK": buildSeries([300, 303, 306, 309, 312]),
      "USDHKD=X": buildSeries([7.8, 7.8, 7.8, 7.8, 7.8]),
    };

    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: seriesByYfinanceSymbol[symbol] || [],
      source: "db",
    }));

    const result = await runStrategyLabBacktest({
      assets: ["US::SPY", "HK::0700"],
      strategies: ["equalWeight", "momentum"],
      startDate: "2026-01-01",
      endDate: "2026-01-05",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      benchmarkSymbol: "SPY",
    });

    expect(vi.mocked(fetchPriceSeriesWithCache)).toHaveBeenCalledWith("SPY", "2026-01-01", expect.any(Object));
    expect(vi.mocked(fetchPriceSeriesWithCache)).toHaveBeenCalledWith("0700.HK", "2026-01-01", expect.any(Object));
    expect(result.strategyResults.map((item) => item.strategy)).toEqual(["equalWeight", "momentum"]);
    expect(result.equityCurve).toEqual(result.strategyResults[0].equityCurve);
    expect(Object.keys(result.targetWeights).sort()).toEqual(["HK::0700", "US::SPY"]);
    expect(Object.keys(result.strategyResults[1].targetWeights)).toContain("HK::0700");
    expect(result.attribution.benchmark.coverage).toBe("full");
  });

  it("按交易日并集估值，避免跨市场假期把有效历史裁短", async () => {
    const seriesByYfinanceSymbol: Record<string, ReturnType<typeof buildDatedSeries>> = {
      SPY: buildDatedSeries([
        ["2026-01-01", 100],
        ["2026-01-03", 102],
        ["2026-01-04", 103],
      ]),
      "0700.HK": buildDatedSeries([
        ["2026-01-01", 300],
        ["2026-01-02", 301],
        ["2026-01-03", 302],
        ["2026-01-04", 303],
      ]),
      "USDHKD=X": buildDatedSeries([
        ["2026-01-01", 7.8],
        ["2026-01-02", 7.8],
        ["2026-01-03", 7.8],
        ["2026-01-04", 7.8],
      ]),
    };

    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: seriesByYfinanceSymbol[symbol] || [],
      source: "db",
    }));

    const result = await runStrategyLabBacktest({
      assets: ["US::SPY", "HK::0700"],
      strategies: ["equalWeight"],
      startDate: "2026-01-01",
      endDate: "2026-01-04",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      benchmarkSymbol: "SPY",
    });

    expect(result.equityCurve.map((point) => point.date)).toEqual(["2026-01-02", "2026-01-03", "2026-01-04"]);
    expect(result.warnings.some((warning) => warning.includes("交易日并集"))).toBe(true);
  });

  it("将非基准货币资产按历史 FX 序列转换为基准货币估值", async () => {
    const seriesByYfinanceSymbol: Record<string, ReturnType<typeof buildDatedSeries>> = {
      "0700.HK": buildDatedSeries([
        ["2026-01-01", 80],
        ["2026-01-02", 80],
        ["2026-01-03", 80],
      ]),
      SPY: buildDatedSeries([
        ["2026-01-01", 100],
        ["2026-01-02", 100],
        ["2026-01-03", 100],
      ]),
      "USDHKD=X": buildDatedSeries([
        ["2026-01-01", 8],
        ["2026-01-02", 4],
        ["2026-01-03", 4],
      ]),
    };

    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: seriesByYfinanceSymbol[symbol] || [],
      source: "db",
    }));

    const result = await runStrategyLabBacktest({
      assets: ["HK::0700"],
      strategies: ["equalWeight"],
      startDate: "2026-01-01",
      endDate: "2026-01-03",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      baseCurrency: "USD",
      benchmarkSymbol: "SPY",
      feeRateBps: 0,
      slippageBps: 0,
    });

    expect(result.baseCurrency).toBe("USD");
    expect(result.metrics.totalReturn).toBeCloseTo(1, 8);
    expect(result.warnings.some((warning) => warning.includes("HKD/USD"))).toBe(true);
  });

  it("月度回测只在月初交易日打开再平衡信号，不再按每日漂移触发", async () => {
    const seriesByYfinanceSymbol: Record<string, ReturnType<typeof buildDatedSeries>> = {
      SPY: buildDatedSeries([
        ["2026-01-01", 100],
        ["2026-01-02", 200],
        ["2026-01-03", 200],
        ["2026-01-04", 200],
      ]),
      "0700.HK": buildDatedSeries([
        ["2026-01-01", 300],
        ["2026-01-02", 300],
        ["2026-01-03", 300],
        ["2026-01-04", 300],
      ]),
      "USDHKD=X": buildDatedSeries([
        ["2026-01-01", 7.8],
        ["2026-01-02", 7.8],
        ["2026-01-03", 7.8],
        ["2026-01-04", 7.8],
      ]),
    };

    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: seriesByYfinanceSymbol[symbol] || [],
      source: "db",
    }));

    const result = await runStrategyLabBacktest({
      assets: ["US::SPY", "HK::0700"],
      strategies: ["equalWeight"],
      startDate: "2026-01-01",
      endDate: "2026-01-04",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      benchmarkSymbol: "SPY",
    });

    expect(result.attribution.rebalanceEvents).toHaveLength(0);
  });

  it("所有资产都没有价格历史时抛出可被 API 透传的领域错误", async () => {
    vi.mocked(fetchPriceSeriesWithCache).mockResolvedValue({
      symbol: "SPY",
      data: [],
      source: "yahoo",
      error: "fetch_failed",
    });

    await expect(runStrategyLabBacktest({
      assets: ["US::SPY"],
      strategies: ["equalWeight"],
      startDate: "2026-01-01",
      endDate: "2026-01-05",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
    })).rejects.toMatchObject({
      name: "StrategyLabDomainError",
      code: "NO_PRICE_HISTORY",
      status: 422,
    } satisfies Partial<StrategyLabDomainError>);
  });
});
