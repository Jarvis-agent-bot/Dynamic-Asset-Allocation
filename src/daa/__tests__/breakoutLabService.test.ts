import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/modules/marketCache/priceSeriesCache", () => ({
  fetchPriceSeriesWithCache: vi.fn(),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  withDaaPgClient: vi.fn(async (fn: (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => fn({
    query: vi.fn(async () => ({ rows: [] })),
  })),
}));

import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { BreakoutLabDomainError, runBreakoutLabBacktest } from "@/src/daa/modules/strategyLab/breakoutLabService";

function buildBreakoutBars() {
  return [
    { date: "2026-01-01", open: 10.0, high: 10.1, low: 9.9, close: 10.0, volume: 100 },
    { date: "2026-01-02", open: 10.1, high: 10.2, low: 10.0, close: 10.1, volume: 100 },
    { date: "2026-01-03", open: 10.2, high: 10.3, low: 10.1, close: 10.2, volume: 100 },
    { date: "2026-01-04", open: 10.3, high: 10.4, low: 10.2, close: 10.3, volume: 100 },
    { date: "2026-01-05", open: 10.4, high: 10.5, low: 10.3, close: 10.4, volume: 100 },
    { date: "2026-01-06", open: 10.5, high: 10.6, low: 10.4, close: 10.5, volume: 100 },
    { date: "2026-01-07", open: 10.6, high: 10.7, low: 10.5, close: 10.6, volume: 100 },
    { date: "2026-01-08", open: 10.7, high: 11.1, low: 10.6, close: 11.0, volume: 200 },
    { date: "2026-01-09", open: 11.0, high: 12.2, low: 10.9, close: 12.0, volume: 200 },
  ];
}

describe("breakoutLabService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("按可用现金做组合资金模拟，并输出日频权益曲线", async () => {
    const bars = buildBreakoutBars();
    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: symbol === "AAA" || symbol === "BBB" ? bars : [],
      source: "db",
      rowsCovered: bars.length,
    }));

    const result = await runBreakoutLabBacktest({
      assets: ["US::AAA", "US::BBB"],
      startDate: "2026-01-01",
      endDate: "2026-01-09",
      initialCapital: 100,
      riskPct: 0.5,
      maxSlots: 3,
      strategy: {
        breakoutLookback: 2,
        volMultiple: 0,
        maFast: 2,
        maSlow: 3,
        maxExtensionPct: 1,
        stopPct: 0.1,
        rewardMultiple: 1,
        exitMode: "target",
      },
    });

    expect(result.portfolio.finalEquity).toBeCloseTo(110, 6);
    expect(result.portfolio.tradesTaken).toBe(1);
    expect(result.portfolio.equityCurve.map((point) => point.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("使用所选资产池的买入持有作为基准，而不是硬编码 QQQ", async () => {
    const bars = buildBreakoutBars();
    vi.mocked(fetchPriceSeriesWithCache).mockImplementation(async (symbol: string) => ({
      symbol,
      data: symbol === "AAA" || symbol === "BBB" ? bars : [],
      source: "db",
      rowsCovered: bars.length,
    }));

    const result = await runBreakoutLabBacktest({
      assets: ["US::AAA", "US::BBB"],
      startDate: "2026-01-01",
      endDate: "2026-01-09",
      initialCapital: 100_000,
      riskPct: 0.01,
      maxSlots: 3,
      strategy: {
        breakoutLookback: 2,
        volMultiple: 0,
        maFast: 2,
        maSlow: 3,
        maxExtensionPct: 1,
        stopPct: 0.1,
        rewardMultiple: 1,
        exitMode: "target",
      },
    });

    expect(result.benchmark).not.toBeNull();
    expect(result.benchmark?.symbol).not.toBe("QQQ");
    expect(result.benchmark?.buyHoldReturnPct).toBeCloseTo(20, 6);
  });

  it("在价格拉取前拒绝非法参数", async () => {
    await expect(runBreakoutLabBacktest({
      assets: ["US::AAA"],
      startDate: "2026-02-31",
      endDate: "2026-03-01",
      initialCapital: 100_000,
    })).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      message: "开始日期格式无效，应为 YYYY-MM-DD",
    });

    await expect(runBreakoutLabBacktest({
      assets: ["US::AAA"],
      startDate: "2026-02-01",
      endDate: "2026-01-01",
      initialCapital: 100_000,
    })).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      message: "开始日期不能晚于结束日期",
    });

    await expect(runBreakoutLabBacktest({
      assets: ["US::AAA"],
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      initialCapital: 0,
    })).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      message: "初始资金必须大于 0",
    });

    await expect(runBreakoutLabBacktest({
      assets: ["US::AAA"],
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      initialCapital: 100_000,
      riskPct: 0,
    })).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      message: "每笔风险必须大于 0",
    });

    expect(vi.mocked(fetchPriceSeriesWithCache)).not.toHaveBeenCalled();
  });
});
