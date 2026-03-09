import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/cron/authV1", () => ({
  requireCronAuthV1: vi.fn(() => null),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheServiceV1", () => ({
  refreshMarketPricesV1: vi.fn(async () => ({
    refreshed: 0,
    stale: 0,
    missing: 0,
    results: {},
  })),
  cleanupMarketCacheRawPayloadV1: vi.fn(async () => ({
    removed: 0,
    at: "2026-03-06T00:00:00.000Z",
  })),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  appendPriceHistoryRowsV1: vi.fn(async () => 0),
  getDaaSystemConfigV2: vi.fn(async () => ({
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
  listDaaAssetUniverseV1: vi.fn(async () => [
    {
      assetKey: "US::AAPL",
      market: "US",
      symbol: "AAPL",
      currency: "USD",
    },
  ]),
  updateDaaAssetUniverseLastPriceV1: vi.fn(async () => null),
}));

import { POST as priceRefreshPost } from "@/app/api/daa/cron/price-refresh/route";
import { POST as cacheCleanupPost } from "@/app/api/daa/cron/cache-cleanup/route";
import { cleanupMarketCacheRawPayloadV1, refreshMarketPricesV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";

describe("cron-market-cache-routes-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("price-refresh 目标集合包含 featured 商品", async () => {
    const response = await priceRefreshPost(new Request("http://localhost/api/daa/cron/price-refresh", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(vi.mocked(refreshMarketPricesV1)).toHaveBeenCalledTimes(1);
    const input = vi.mocked(refreshMarketPricesV1).mock.calls[0]?.[0];
    expect(Array.isArray(input?.assets)).toBe(true);
    expect(input?.assets.some((row) => row.market === "US" && row.symbol === "GLD")).toBe(true);
  });

  it("cache-cleanup 返回删除计数", async () => {
    vi.mocked(cleanupMarketCacheRawPayloadV1).mockResolvedValue({
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
