import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchChart: vi.fn(),
  ensureDaaMarketCacheSchemaPg: vi.fn(async () => undefined),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  daaPgPool: vi.fn(() => ({
    query: mocks.query,
  })),
}));

vi.mock("@/src/market/yahooProvider", () => ({
  getYahooProvider: vi.fn(() => ({
    fetchChart: mocks.fetchChart,
  })),
}));

vi.mock("@/src/daa/store/storeSchema", () => ({
  ensureDaaMarketCacheSchemaPg: mocks.ensureDaaMarketCacheSchemaPg,
}));

import { fetchPriceSeriesWithCache } from "./priceSeriesCache";

function chartPayload(input: {
  currency: string;
  instrumentType: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  adjClose?: number;
  timestamp?: number;
}) {
  return {
    chart: {
      result: [{
        meta: {
          currency: input.currency,
          instrumentType: input.instrumentType,
        },
        timestamp: [input.timestamp ?? 1_778_198_400],
        indicators: {
          quote: [{
            close: [input.close],
            open: input.open == null ? [] : [input.open],
            high: input.high == null ? [] : [input.high],
            low: input.low == null ? [] : [input.low],
            volume: input.volume == null ? [] : [input.volume],
          }],
          adjclose: input.adjClose == null ? [] : [{ adjclose: [input.adjClose] }],
        },
      }],
      error: null,
    },
  };
}

async function flushAsyncWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function candleRow(date: string, close = 100) {
  return {
    date,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1000,
    adj_close: close,
  };
}

describe("priceSeriesCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureDaaMarketCacheSchemaPg.mockResolvedValue(undefined);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT DISTINCT ON")) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });
  });

  it("writes Yahoo chart history with market and currency from chart metadata", async () => {
    mocks.fetchChart.mockResolvedValue({
      payloadJson: chartPayload({
        currency: "KRW",
        instrumentType: "EQUITY",
        close: 1_745_000,
      }),
    });

    const result = await fetchPriceSeriesWithCache("000660.KS", "2026-05-01", {
      minDbDays: 2,
    });
    await flushAsyncWrites();

    expect(result.data).toEqual([{ date: "2026-05-08", close: 1_745_000 }]);
    const insertCall = mocks.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO daa_market_price_history_v1"));
    expect(insertCall?.[1]).toEqual([
      "yfinance",
      "KR",
      "000660.KS",
      "2026-05-08T00:00:00Z",
      1_745_000,
      "KRW",
      "price_series_cache",
    ]);
  });

  it("uses explicit asset scope for cache reads and writes when provided", async () => {
    mocks.fetchChart.mockResolvedValue({
      payloadJson: chartPayload({
        currency: "KRW",
        instrumentType: "CURRENCY",
        close: 1_360,
      }),
    });

    await fetchPriceSeriesWithCache("USDKRW=X", "2026-05-01", {
      market: "FX",
      currency: "KRW",
      minDbDays: 2,
    });
    await flushAsyncWrites();

    const selectCall = mocks.query.mock.calls.find((call) => String(call[0]).includes("FROM daa_market_candles_v1"));
    expect(String(selectCall?.[0])).toContain("market = $4");
    expect(selectCall?.[1]).toEqual(["USDKRW=X", "2026-05-01", "1d", "FX"]);

    const insertCall = mocks.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO daa_market_price_history_v1"));
    expect(insertCall?.[1]).toEqual([
      "yfinance",
      "FX",
      "USDKRW=X",
      "2026-05-08T00:00:00Z",
      1_360,
      "KRW",
      "price_series_cache",
    ]);
  });

  it("writes real OHLCV candles for chart consumers without fabricating bars from close-only history", async () => {
    mocks.fetchChart.mockResolvedValue({
      payloadJson: chartPayload({
        currency: "KRW",
        instrumentType: "EQUITY",
        open: 174_000,
        high: 176_000,
        low: 173_500,
        close: 175_000,
        volume: 1_234_567,
        adjClose: 174_900,
      }),
    });

    const result = await fetchPriceSeriesWithCache("005930.KS", "2026-05-01", {
      market: "KR",
      currency: "KRW",
      adjusted: false,
      requireOhlcv: true,
      minDbDays: 2,
      writeMode: "sync",
    });

    expect(result.data).toEqual([{
      date: "2026-05-08",
      open: 174_000,
      high: 176_000,
      low: 173_500,
      close: 175_000,
      volume: 1_234_567,
      adjClose: 174_900,
    }]);
    const candleInsert = mocks.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO daa_market_candles_v1"));
    expect(candleInsert?.[1]).toEqual([
      "yfinance",
      "KR",
      "005930.KS",
      "1d",
      "2026-05-08T00:00:00Z",
      174_000,
      176_000,
      173_500,
      175_000,
      1_234_567,
      174_900,
      "KRW",
      "price_series_cache",
    ]);
  });

  it("keeps raw OHLC close for real candles even when adjusted close exists", async () => {
    mocks.fetchChart.mockResolvedValue({
      payloadJson: chartPayload({
        currency: "KRW",
        instrumentType: "EQUITY",
        open: 174_000,
        high: 176_000,
        low: 173_500,
        close: 175_000,
        volume: 1_234_567,
        adjClose: 174_900,
      }),
    });

    const result = await fetchPriceSeriesWithCache("005930.KS", "2026-05-01", {
      market: "KR",
      currency: "KRW",
      requireOhlcv: true,
      minDbDays: 2,
      writeMode: "sync",
    });

    expect(result.priceMode).toBe("close");
    expect(result.data[0]).toMatchObject({
      open: 174_000,
      high: 176_000,
      low: 173_500,
      close: 175_000,
      adjClose: 174_900,
    });
  });

  it("surfaces Yahoo chart errors instead of returning an empty successful series", async () => {
    mocks.fetchChart.mockResolvedValue({
      payloadJson: {
        chart: {
          result: null,
          error: {
            code: "Not Found",
            description: "No data found, symbol may be delisted",
          },
        },
      },
    });

    const result = await fetchPriceSeriesWithCache("MISSING", "2026-05-01", {
      market: "US",
      minDbDays: 2,
      writeMode: "sync",
    });

    expect(result.data).toEqual([]);
    expect(result.error).toMatch(/No data found/);
    expect(result.source).toBe("yahoo");
  });

  it("fetches the requested start range when recent DB candles do not cover it", async () => {
    const requestedStart = addDaysIso(-365);
    const recentRows = Array.from({ length: 20 }, (_, index) => candleRow(addDaysIso(-19 + index), 100 + index));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM daa_market_candles_v1")) return { rows: recentRows };
      return { rows: [], rowCount: 1 };
    });
    mocks.fetchChart.mockResolvedValue({
      payloadJson: chartPayload({
        currency: "KRW",
        instrumentType: "EQUITY",
        open: 90,
        high: 93,
        low: 89,
        close: 92,
        volume: 2000,
        timestamp: Math.floor(Date.parse(`${requestedStart}T00:00:00.000Z`) / 1000),
      }),
    });

    const result = await fetchPriceSeriesWithCache("005930.KS", requestedStart, {
      market: "KR",
      currency: "KRW",
      adjusted: false,
      requireOhlcv: true,
      minDbDays: 15,
      writeMode: "sync",
    });

    expect(mocks.fetchChart).toHaveBeenCalledTimes(1);
    expect(mocks.fetchChart.mock.calls[0]?.[0]).toMatchObject({
      symbol: "005930.KS",
      period1: Math.floor(Date.parse(`${requestedStart}T00:00:00.000Z`) / 1000),
    });
    expect(result.source).toBe("mixed");
    expect(result.data[0]).toMatchObject({ date: requestedStart, open: 90, high: 93, low: 89, close: 92 });
    expect(result.rowsCovered).toBe(21);
  });
});
