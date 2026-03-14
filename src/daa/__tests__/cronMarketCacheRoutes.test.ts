import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/cron/auth", () => ({
  requireCronAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheService", () => ({
  refreshMarketPrices: vi.fn(async () => ({
    refreshed: 0,
    stale: 0,
    missing: 0,
    results: {},
  })),
  cleanupMarketCacheRawPayload: vi.fn(async () => ({
    removed: 0,
    at: "2026-03-06T00:00:00.000Z",
  })),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendPriceHistoryRows: vi.fn(async () => 0),
  getDaaSystemConfig: vi.fn(async () => ({
    config: {
      dataSources: {
        priceFeed: {
          symbols: ["AAPL"],
          marketCache: {
            rawRetentionDays: 90,
          },
        },
        marketIndicators: {
          indicators: {
            vix: { enabled: false, weight: 1 },
            qqqSpyRatio: { enabled: false, weight: 1 },
            fxiVolatility: { enabled: false, weight: 1 },
            kwebFxiRatio: { enabled: false, weight: 1 },
            btcEthRatio: { enabled: false, weight: 1 },
            btcVolatility: { enabled: false, weight: 1 },
            goldSilverRatio: { enabled: false, weight: 1 },
          },
        },
      },
    },
  })),
  listDaaAssetUniverse: vi.fn(async () => [
    {
      assetKey: "US::AAPL",
      market: "US",
      symbol: "AAPL",
      currency: "USD",
    },
  ]),
  updateDaaAssetUniverseLastPrice: vi.fn(async () => null),
}));

import { POST as priceRefreshPost } from "@/app/api/daa/cron/price-refresh/route";
import { POST as cacheCleanupPost } from "@/app/api/daa/cron/cache-cleanup/route";
import { cleanupMarketCacheRawPayload, refreshMarketPrices } from "@/src/daa/modules/marketCache/marketCacheService";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

describe("cron-market-cache-routes-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfig).mockResolvedValue({
      config: {
        dataSources: {
          priceFeed: {
            symbols: ["AAPL"],
            marketCache: {
              rawRetentionDays: 90,
            },
          },
          marketIndicators: {
            indicators: {
              vix: { enabled: false, weight: 1 },
              qqqSpyRatio: { enabled: false, weight: 1 },
              fxiVolatility: { enabled: false, weight: 1 },
              kwebFxiRatio: { enabled: false, weight: 1 },
              btcEthRatio: { enabled: false, weight: 1 },
              btcVolatility: { enabled: false, weight: 1 },
              goldSilverRatio: { enabled: false, weight: 1 },
            },
          },
        },
      },
    } as any);
  });

  it("price-refresh 在行情源关闭时直接跳过", async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue({
      config: {
        dataSources: {
          priceFeed: {
            enabled: false,
            symbols: ["AAPL"],
            marketCache: {
              rawRetentionDays: 90,
            },
          },
          marketIndicators: {
            indicators: {
              vix: { enabled: false, weight: 1 },
              qqqSpyRatio: { enabled: false, weight: 1 },
              fxiVolatility: { enabled: false, weight: 1 },
              kwebFxiRatio: { enabled: false, weight: 1 },
              btcEthRatio: { enabled: false, weight: 1 },
              btcVolatility: { enabled: false, weight: 1 },
              goldSilverRatio: { enabled: false, weight: 1 },
            },
          },
        },
      },
    } as any);

    const response = await priceRefreshPost(new Request("http://localhost/api/daa/cron/price-refresh", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.requested).toBe(0);
    expect(json.data.refreshedSymbols).toBe(0);
    expect(vi.mocked(refreshMarketPrices)).not.toHaveBeenCalled();
  });

  it("price-refresh 目标集合包含 featured 商品", async () => {
    const response = await priceRefreshPost(new Request("http://localhost/api/daa/cron/price-refresh", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(vi.mocked(refreshMarketPrices)).toHaveBeenCalledTimes(1);
    const input = vi.mocked(refreshMarketPrices).mock.calls[0]?.[0];
    expect(Array.isArray(input?.assets)).toBe(true);
    expect(input?.assets.some((row) => row.market === "US" && row.symbol === "GLD")).toBe(true);
  });

  it("cache-cleanup 返回删除计数", async () => {
    vi.mocked(cleanupMarketCacheRawPayload).mockResolvedValue({
      removed: 7,
      at: "2026-03-06T00:00:00.000Z",
    });

    const response = await cacheCleanupPost(new Request("http://localhost/api/daa/cron/cache-cleanup", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.removed).toBe(7);
  });
});
