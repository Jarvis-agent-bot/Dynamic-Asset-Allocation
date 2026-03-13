import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncWorkbenchPrices } from "@/src/daa/modules/workbench/workbenchReadService";

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendPriceHistoryRows: vi.fn(async () => 0),
  getDaaSystemConfig: vi.fn(),
  getDaaMarketCacheHealthStats: vi.fn(async () => ({ freshCount: 0, staleCount: 0, missingCount: 0, errorCount: 0, unsupportedCount: 0, totalSnapshots: 0, recentJobSuccessRatePct: 100, recentJobFailureRatePct: 0, provider: "yfinance" })),
  listDaaAssetUniverse: vi.fn(),
  updateDaaAssetUniverseLastPrice: vi.fn(async (input: Record<string, unknown>) => input),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheService", () => ({
  getMarketPricesWithCache: vi.fn(),
}));

import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { getDaaSystemConfig, listDaaAssetUniverse, updateDaaAssetUniverseLastPrice } from "@/src/daa/store/daaStorePg";

describe("workbench-bootstrap-price-sync-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfig).mockResolvedValue({
      config: {
        dataSources: {
          priceFeed: {
            marketCache: {
              freshMinutes: 15,
              serveStaleHours: 48,
              rawRetentionDays: 90,
            },
          },
        },
      },
    } as any);
  });

  it("行情源关闭时跳过价格刷新，不再触发外部行情拉取", async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue({
      config: {
        dataSources: {
          priceFeed: {
            enabled: false,
            marketCache: {
              freshMinutes: 15,
              serveStaleHours: 48,
              rawRetentionDays: 90,
            },
          },
        },
      },
    } as any);
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        lastPrice: 188.2,
        priceUpdatedAt: new Date().toISOString(),
      },
      {
        assetKey: "US::MSFT",
        symbol: "MSFT",
        market: "US",
        currency: "USD",
        lastPrice: 399.1,
        priceUpdatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      },
    ] as any);

    const result = await syncWorkbenchPrices({ forceRefreshAll: true });

    expect(result).toEqual({ updated: 0, attempted: 0, skipped: 2 });
    expect(vi.mocked(getMarketPricesWithCache)).not.toHaveBeenCalled();
    expect(vi.mocked(updateDaaAssetUniverseLastPrice)).not.toHaveBeenCalled();
  });

  it("forceRefreshAll=true 时会为总览刷新所有资产，而不是只刷新过期资产", async () => {
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        lastPrice: 188.2,
        priceUpdatedAt: new Date().toISOString(),
      },
      {
        assetKey: "US::MSFT",
        symbol: "MSFT",
        market: "US",
        currency: "USD",
        lastPrice: 399.1,
        priceUpdatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      },
    ] as any);
    const fetchedAtAapl = new Date().toISOString();
    const fetchedAtMsft = new Date(Date.now() - 15 * 1000).toISOString();
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({
      "US::AAPL": {
        provider: "yfinance",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 189.5,
        priceStatus: "fresh",
        priceUpdatedAt: fetchedAtAapl,
        priceAgeSec: 2,
        priceSource: "workbench_bootstrap:yfinance:AAPL",
      },
      "US::MSFT": {
        provider: "yfinance",
        symbol: "MSFT",
        market: "US",
        currency: "USD",
        price: 401.2,
        priceStatus: "fresh",
        priceUpdatedAt: fetchedAtMsft,
        priceAgeSec: 15,
        priceSource: "workbench_bootstrap:yfinance:MSFT",
      },
    });

    const result = await syncWorkbenchPrices({ forceRefreshAll: true });

    expect(result).toEqual({ updated: 2, attempted: 2, skipped: 0 });
    expect(vi.mocked(getMarketPricesWithCache)).toHaveBeenCalledWith(expect.objectContaining({
      forceRefresh: true,
      refreshBudget: 2,
      source: "workbench_bootstrap",
      assets: [
        { symbol: "AAPL", market: "US", currency: "USD" },
        { symbol: "MSFT", market: "US", currency: "USD" },
      ],
    }));
    expect(vi.mocked(updateDaaAssetUniverseLastPrice)).toHaveBeenNthCalledWith(1, {
      assetKey: "US::AAPL",
      lastPrice: 189.5,
      priceUpdatedAt: fetchedAtAapl,
    });
    expect(vi.mocked(updateDaaAssetUniverseLastPrice)).toHaveBeenNthCalledWith(2, {
      assetKey: "US::MSFT",
      lastPrice: 401.2,
      priceUpdatedAt: fetchedAtMsft,
    });
  });
});
