import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendDaaExternalPayloadRaw: vi.fn(async () => ({ id: "raw_test_1" })),
  appendDaaIngestJobLog: vi.fn(async () => ({ jobId: "job_test_1" })),
  appendDaaMarketPriceHistoryRows: vi.fn(async () => 0),
  deleteExpiredDaaExternalPayloadRaw: vi.fn(async () => 0),
  getDaaMarketCacheHealthStats: vi.fn(async () => ({
    provider: "yfinance",
    totalSnapshots: 0,
    freshCount: 0,
    staleCount: 0,
    missingCount: 0,
    errorCount: 0,
    unsupportedCount: 0,
    recentJobSuccessRatePct: 100,
    recentJobFailureRatePct: 0,
  })),
  listDaaMarketPriceSnapshots: vi.fn(async () => []),
  listLatestDaaMarketPriceHistoryRows: vi.fn(async () => []),
  upsertDaaMarketPriceSnapshots: vi.fn(async (rows: Array<Record<string, unknown>>) => rows.map((row) => ({
    provider: String(row.provider || "yfinance"),
    market: String(row.market || "US").toUpperCase(),
    symbol: String(row.symbol || "").toUpperCase(),
    normalizedSymbol: String(row.normalizedSymbol || row.symbol || "").toUpperCase(),
    currency: String(row.currency || "USD").toUpperCase(),
    price: Number(row.price || 0),
    status: String(row.status || "missing"),
    priceUpdatedAt: row.priceUpdatedAt ? String(row.priceUpdatedAt) : null,
    source: String(row.source || "test"),
    errorCode: row.errorCode ? String(row.errorCode) : null,
    errorMessage: row.errorMessage ? String(row.errorMessage) : null,
    rawRefId: row.rawRefId ? String(row.rawRefId) : null,
    updatedAt: new Date().toISOString(),
  }))),
}));

import {
  appendDaaMarketPriceHistoryRows,
  listDaaMarketPriceSnapshots,
  listLatestDaaMarketPriceHistoryRows,
  upsertDaaMarketPriceSnapshots,
} from "@/src/daa/store/daaStorePg";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";

function buildChartPayload(price: number, ts = "2026-03-06T00:00:00.000Z"): string {
  const unix = Math.floor(Date.parse(ts) / 1000);
  return JSON.stringify({
    chart: {
      result: [
        {
          timestamp: [unix],
          indicators: {
            quote: [{ close: [price] }],
          },
        },
      ],
      error: null,
    },
  });
}

describe("market-cache-service-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([]);
    vi.mocked(listLatestDaaMarketPriceHistoryRows).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("快照状态为 stale 时即使较新也返回 stale", async () => {
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([
      {
        provider: "yfinance",
        market: "US",
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        currency: "USD",
        price: 188.12,
        status: "stale",
        priceUpdatedAt: new Date().toISOString(),
        source: "test",
        errorCode: null,
        errorMessage: null,
        rawRefId: null,
        updatedAt: new Date().toISOString(),
      } as any,
    ]);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "AAPL", currency: "USD" }],
      allowRefresh: false,
    });

    expect(result["US::AAPL"]?.price).toBe(188.12);
    expect(result["US::AAPL"]?.priceStatus).toBe("stale");
  });

  it("stale 超过可服务窗口返回 missing", async () => {
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([
      {
        provider: "yfinance",
        market: "US",
        symbol: "AAPL",
        normalizedSymbol: "AAPL",
        currency: "USD",
        price: 199,
        status: "stale",
        priceUpdatedAt: "2026-03-01T00:00:00.000Z",
        source: "test",
        errorCode: null,
        errorMessage: null,
        rawRefId: null,
        updatedAt: new Date().toISOString(),
      } as any,
    ]);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "AAPL", currency: "USD" }],
      allowRefresh: false,
      freshSec: 60,
      serveStaleSec: 3600,
    });

    expect(result["US::AAPL"]?.priceStatus).toBe("missing");
    expect(result["US::AAPL"]?.price).toBe(0);
  });

  it("429 后会单次重试并写入 fresh 快照", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(buildChartPayload(321.45), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "MSFT", currency: "USD" }],
      allowRefresh: true,
      refreshBudget: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result["US::MSFT"]?.price).toBe(321.45);
    expect(result["US::MSFT"]?.priceStatus).toBe("fresh");
    expect(vi.mocked(appendDaaMarketPriceHistoryRows)).toHaveBeenCalledTimes(1);
  });

  it("刷新失败时会从 history 回捞最后成功价并标记 stale", async () => {
    const fallbackPriceUpdatedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([
      {
        provider: "yfinance",
        market: "US",
        symbol: "NVDA",
        normalizedSymbol: "NVDA",
        currency: "USD",
        price: 0,
        status: "missing",
        priceUpdatedAt: null,
        source: "test",
        errorCode: "upstream_error",
        errorMessage: "quote unavailable",
        rawRefId: null,
        updatedAt: new Date().toISOString(),
      } as any,
    ]);
    vi.mocked(listLatestDaaMarketPriceHistoryRows).mockResolvedValue([
      {
        provider: "yfinance",
        market: "US",
        symbol: "NVDA",
        ts: fallbackPriceUpdatedAt,
        price: 700.11,
        currency: "USD",
        source: "market_cache",
        rawRefId: "raw_hist_1",
      } as any,
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "NVDA", currency: "USD" }],
      allowRefresh: true,
      refreshBudget: 1,
      freshSec: 10,
      serveStaleSec: 24 * 3600,
    });

    expect(result["US::NVDA"]?.price).toBe(700.11);
    expect(result["US::NVDA"]?.priceStatus).toBe("stale");
    expect(result["US::NVDA"]?.priceUpdatedAt).toBe(fallbackPriceUpdatedAt);
    const latestUpsertInput = vi.mocked(upsertDaaMarketPriceSnapshots).mock.calls.at(-1)?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(latestUpsertInput?.price).toBe(700.11);
    expect(latestUpsertInput?.status).toBe("stale");
    expect(latestUpsertInput?.priceUpdatedAt).toBe(fallbackPriceUpdatedAt);
  });

  it("禁用刷新时也会回捞 history 的最后成功价", async () => {
    const fallbackPriceUpdatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    vi.mocked(listLatestDaaMarketPriceHistoryRows).mockResolvedValue([
      {
        provider: "yfinance",
        market: "US",
        symbol: "AMD",
        ts: fallbackPriceUpdatedAt,
        price: 188.88,
        currency: "USD",
        source: "market_cache",
        rawRefId: "raw_hist_2",
      } as any,
    ]);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "AMD", currency: "USD" }],
      allowRefresh: false,
      serveStaleSec: 24 * 3600,
    });

    expect(result["US::AMD"]?.price).toBe(188.88);
    expect(result["US::AMD"]?.priceStatus).toBe("stale");
    expect(vi.mocked(upsertDaaMarketPriceSnapshots)).not.toHaveBeenCalled();
  });

  it("无历史成功值且上游失败时返回 missing", async () => {
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "TSLA", currency: "USD" }],
      allowRefresh: true,
      refreshBudget: 1,
    });

    expect(result["US::TSLA"]?.priceStatus).toBe("missing");
    expect(result["US::TSLA"]?.price).toBe(0);
    const latestUpsertInput = vi.mocked(upsertDaaMarketPriceSnapshots).mock.calls.at(-1)?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(latestUpsertInput?.priceUpdatedAt ?? null).toBeNull();
    expect(vi.mocked(listDaaMarketPriceSnapshots)).toHaveBeenCalledTimes(1);
  });
});
