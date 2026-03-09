import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  appendPriceHistoryRowsV1: vi.fn(async () => 0),
  getDaaSystemConfigV2: vi.fn(),
  getDaaMarketCacheHealthStatsV1: vi.fn(async () => ({ freshCount: 0, staleCount: 0, missingCount: 0, errorCount: 0, unsupportedCount: 0, totalSnapshots: 0, recentJobSuccessRatePct: 100, recentJobFailureRatePct: 0, provider: "yfinance" })),
  listDaaAssetUniverseV1: vi.fn(),
  updateDaaAssetUniverseLastPriceV1: vi.fn(async (input: Record<string, unknown>) => input),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheServiceV1", () => ({
  getMarketPricesWithCacheV1: vi.fn(),
}));

import { syncWorkbenchPricesV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { getDaaSystemConfigV2, listDaaAssetUniverseV1, updateDaaAssetUniverseLastPriceV1 } from "@/src/daa/store/daaStorePgV1";

describe("workbench-bootstrap-price-sync-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue({
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

  it("forceRefreshAll=true 时会为总览刷新所有资产，而不是只刷新过期资产", async () => {
    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([
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
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({
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

    const result = await syncWorkbenchPricesV1({ forceRefreshAll: true });

    expect(result).toEqual({ updated: 2, attempted: 2, skipped: 0 });
    expect(vi.mocked(getMarketPricesWithCacheV1)).toHaveBeenCalledWith(expect.objectContaining({
      forceRefresh: true,
      refreshBudget: 2,
      source: "workbench_bootstrap",
      assets: [
        { symbol: "AAPL", market: "US", currency: "USD" },
        { symbol: "MSFT", market: "US", currency: "USD" },
      ],
    }));
    expect(vi.mocked(updateDaaAssetUniverseLastPriceV1)).toHaveBeenNthCalledWith(1, {
      assetKey: "US::AAPL",
      lastPrice: 189.5,
      priceUpdatedAt: fetchedAtAapl,
    });
    expect(vi.mocked(updateDaaAssetUniverseLastPriceV1)).toHaveBeenNthCalledWith(2, {
      assetKey: "US::MSFT",
      lastPrice: 401.2,
      priceUpdatedAt: fetchedAtMsft,
    });
  });
});
