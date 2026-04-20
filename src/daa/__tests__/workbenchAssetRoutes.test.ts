import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAssetUniverseRow,
  buildAssetUniverseView,
  buildMarketPriceResolved,
  buildSystemConfigRow,
  buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture,
} from "@/src/daa/__tests__/testDataFactories";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
  patchDaaAssetUniverseRow: vi.fn(),
  updateDaaAssetUniverseLastPrice: vi.fn(),
  upsertDaaAssetUniverseRow: vi.fn(),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheService", () => ({
  getMarketPricesWithCache: vi.fn(async () => ({})),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn(),
}));

import { POST as upsertAsset } from "@/app/api/daa/workbench/assets/upsert/route";
import { PATCH as patchAsset } from "@/app/api/daa/workbench/assets/[assetKey]/route";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { getDaaSystemConfig, patchDaaAssetUniverseRow, updateDaaAssetUniverseLastPrice, upsertDaaAssetUniverseRow } from "@/src/daa/store/daaStorePg";

const MOCK_ASSET_ROW_VIEW = buildAssetUniverseView({
  assetKey: "US::AAPL",
  symbol: "AAPL",
  market: "US",
  currency: "USD",
  lastPrice: 188.2,
  priceUpdatedAt: "2026-03-01T00:00:00.000Z",
  priceStatus: "fresh",
  priceSource: "yfinance:AAPL",
  priceAgeSec: 60,
  valuationBase: null,
});

const MOCK_ASSET_ROW = buildAssetUniverseView({
  assetKey: "US::AAPL",
  symbol: "AAPL",
  market: "US",
  currency: "USD",
  lastPrice: 188.2,
  priceUpdatedAt: "2026-03-01T00:00:00.000Z",
  priceStatus: "fresh",
  priceSource: "yfinance:AAPL",
  priceAgeSec: 60,
  valuationBase: null,
});

describe("workbench-asset-routes-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      dataSources: {
        priceFeed: {
          marketCache: {
            freshMinutes: 15,
            serveStaleHours: 48,
            rawRetentionDays: 90,
          },
        },
      },
    }));
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({});
    vi.mocked(updateDaaAssetUniverseLastPrice).mockResolvedValue(buildAssetUniverseRow({ assetKey: "US::AAPL" }));
    vi.mocked(upsertDaaAssetUniverseRow).mockResolvedValue(buildAssetUniverseRow({ assetKey: "US::AAPL" }));
    vi.mocked(patchDaaAssetUniverseRow).mockResolvedValue(buildAssetUniverseRow({ assetKey: "US::AAPL" }));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildWorkbenchBootstrapFixture({
      account: { cash: 1000, investableCash: 1000, frozenCash: 0, totalEquity: 1000 },
      assetUniverse: [MOCK_ASSET_ROW_VIEW],
    }));
  });

  it("assets/upsert 返回标准 row", async () => {
    const response = await upsertAsset(new Request("http://localhost/api/daa/workbench/assets/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: "aapl",
        market: "us",
        currency: "usd",
        assetClass: "EQUITY",
        region: "US",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.row.assetKey).toBe("US::AAPL");
    expect(json.data.row.assetClass).toBe("EQUITY");
    expect(vi.mocked(upsertDaaAssetUniverseRow)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertDaaAssetUniverseRow).mock.calls[0]?.[0]?.symbol).toBe("AAPL");
  });

  it("assets/{assetKey} PATCH 返回更新后的 row", async () => {
    const response = await patchAsset(
      new Request("http://localhost/api/daa/workbench/assets/US::AAPL", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          watchEnabled: true,
          watchTags: ["core", "tech"],
          notes: "长期跟踪",
        }),
      }),
      { params: { assetKey: "US::AAPL" } },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.row.assetKey).toBe("US::AAPL");
    expect(vi.mocked(patchDaaAssetUniverseRow)).toHaveBeenCalledWith(expect.objectContaining({
      assetKey: "US::AAPL",
      watchEnabled: true,
      watchTags: ["core", "tech"],
      notes: "长期跟踪",
    }));
  });

  it("assets/{assetKey} PATCH 优先返回第三方价格", async () => {
    const updatedAt = new Date().toISOString();
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({
      "US::AAPL": buildMarketPriceResolved({
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 199.8,
        priceStatus: "fresh",
        priceUpdatedAt: updatedAt,
        priceAgeSec: 4,
        priceSource: "asset_patch:yfinance:AAPL",
      }),
    });

    const response = await patchAsset(
      new Request("http://localhost/api/daa/workbench/assets/US::AAPL", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes: "使用最新行情",
        }),
      }),
      { params: { assetKey: "US::AAPL" } },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.row.lastPrice).toBe(199.8);
    expect(json.data.row.priceStatus).toBe("fresh");
    expect(json.data.row.priceUpdatedAt).toBe(updatedAt);
    expect(json.data.row).not.toHaveProperty("priceFetchedAt");
    expect(json.data.row).not.toHaveProperty("priceAsOf");
    expect(vi.mocked(getMarketPricesWithCache)).toHaveBeenCalledWith(expect.objectContaining({
      forceRefresh: true,
      refreshBudget: 1,
      source: "asset_patch",
    }));
    expect(vi.mocked(updateDaaAssetUniverseLastPrice)).toHaveBeenCalledWith({
      assetKey: "US::AAPL",
      lastPrice: 199.8,
      priceUpdatedAt: updatedAt,
    });
  });

});
