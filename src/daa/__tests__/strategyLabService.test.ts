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
      QQQ: buildSeries([200, 202, 205, 207, 210]),
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
    expect(result.benchmarkResults.map((item) => item.symbol)).toEqual(["SPY", "QQQ"]);
    expect(result.benchmarkResults.every((item) => item.equityCurve.length >= 2)).toBe(true);
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

  it("首日建仓不会暴露 minOrderNotional=0.00 的微小舍入 warning", async () => {
    const seriesByYfinanceSymbol: Record<string, ReturnType<typeof buildSeries>> = {
      AAA: buildSeries([100, 100, 100]),
      BBB: buildSeries([100, 100, 100]),
      CCC: buildSeries([100, 100, 100]),
      SPY: buildSeries([100, 100, 100]),
    };

    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: seriesByYfinanceSymbol[symbol] || [],
      source: "db",
    }));

    const result = await runStrategyLabBacktest({
      assets: ["US::AAA", "US::BBB", "US::CCC"],
      strategies: ["equalWeight"],
      startDate: "2026-01-01",
      endDate: "2026-01-03",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      benchmarkSymbol: "SPY",
      feeRateBps: 0,
      slippageBps: 0,
    });

    const warnings = result.warnings.join("\n");
    expect(warnings).not.toMatch(/minOrderNotional=0\.00/);
    expect(warnings).not.toMatch(/skipped 0\.00/);
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

  it("动量策略只使用信号日前可见历史，不用后续全周期收益选权重", async () => {
    const seriesByYfinanceSymbol: Record<string, ReturnType<typeof buildDatedSeries>> = {
      AAA: buildDatedSeries([
        ["2026-01-30", 100],
        ["2026-01-31", 120],
        ["2026-02-01", 130],
        ["2026-02-02", 130],
        ["2026-02-03", 130],
      ]),
      BBB: buildDatedSeries([
        ["2026-01-30", 100],
        ["2026-01-31", 90],
        ["2026-02-01", 80],
        ["2026-02-02", 500],
        ["2026-02-03", 600],
      ]),
      SPY: buildDatedSeries([
        ["2026-01-30", 100],
        ["2026-01-31", 100],
        ["2026-02-01", 100],
        ["2026-02-02", 100],
        ["2026-02-03", 100],
      ]),
    };

    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: seriesByYfinanceSymbol[symbol] || [],
      source: "db",
    }));

    const result = await runStrategyLabBacktest({
      assets: ["US::AAA", "US::BBB"],
      strategies: ["momentum"],
      startDate: "2026-01-30",
      endDate: "2026-02-03",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      benchmarkSymbol: "SPY",
      feeRateBps: 0,
      slippageBps: 0,
    });

    expect(result.targetWeights["US::AAA"]).toBeCloseTo(1, 8);
    expect(result.targetWeights["US::BBB"] ?? 0).toBeCloseTo(0, 8);
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

  it("跨市场风险平价只使用真实交易样本，不把补平出来的静止日当成低波动", async () => {
    const usSeries: Array<[string, number]> = [];
    const hkSeries: Array<[string, number]> = [];
    for (let day = 1; day <= 31; day += 1) {
      const date = `2026-01-${String(day).padStart(2, "0")}`;
      usSeries.push([date, day % 2 === 0 ? 110 : 100]);
      if (day % 2 === 0) {
        hkSeries.push([date, day % 4 === 0 ? 110 : 100]);
      }
    }
    for (let day = 1; day <= 28; day += 1) {
      const date = `2026-02-${String(day).padStart(2, "0")}`;
      usSeries.push([date, day % 2 === 0 ? 110 : 100]);
      if (day % 2 === 0) {
        hkSeries.push([date, day % 4 === 0 ? 110 : 100]);
      }
    }
    for (let day = 1; day <= 10; day += 1) {
      const date = `2026-03-${String(day).padStart(2, "0")}`;
      usSeries.push([date, day % 2 === 0 ? 110 : 100]);
      if (day % 2 === 0) {
        hkSeries.push([date, day % 4 === 0 ? 110 : 100]);
      }
    }

    const seriesByYfinanceSymbol: Record<string, ReturnType<typeof buildDatedSeries>> = {
      SPY: buildDatedSeries(usSeries),
      "0700.HK": buildDatedSeries(hkSeries),
      "USDHKD=X": buildDatedSeries(
        [...usSeries].map(([date]) => [date, 7.8]),
      ),
    };

    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: seriesByYfinanceSymbol[symbol] || [],
      source: "db",
      rowsCovered: (seriesByYfinanceSymbol[symbol] || []).length,
    }));

    const result = await runStrategyLabBacktest({
      assets: ["US::SPY", "HK::0700"],
      strategies: ["riskParity"],
      startDate: "2026-01-01",
      endDate: "2026-03-10",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      benchmarkSymbol: "SPY",
      feeRateBps: 0,
      slippageBps: 0,
    });

    expect(result.targetWeights["US::SPY"]).toBeCloseTo(0.5, 1);
    expect(result.targetWeights["HK::0700"]).toBeCloseTo(0.5, 1);
  });

  it("当价格数据来自降级源或有效样本偏少时给出充分性提示", async () => {
    const series = buildSeries([100, 101, 102, 103, 104, 105, 106, 107]);
    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: series,
      source: "yahoo",
      rowsCovered: series.length,
      upstream: "yahoo_provider",
    }));

    const result = await runStrategyLabBacktest({
      assets: ["US::SPY"],
      strategies: ["riskParity"],
      startDate: "2026-01-01",
      endDate: "2026-01-08",
      rebalanceFrequency: "monthly",
      initialCapital: 100_000,
      benchmarkSymbol: "SPY",
      feeRateBps: 0,
      slippageBps: 0,
    });

    expect(result.warnings.some((warning) => warning.includes("样本") || warning.includes("数据源"))).toBe(true);
  });
});
