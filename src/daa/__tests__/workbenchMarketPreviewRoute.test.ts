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
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheService", () => ({
  getMarketPricesWithCache: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchExecutionService", () => ({
  validateExecutionRisk: vi.fn(async () => ({
    overallStatus: "warn",
    items: [],
  })),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
  listDaaFxRates: vi.fn(),
  listDaaAssetUniverse: vi.fn(),
  updateDaaAssetUniverseLastPrice: vi.fn(),
}));

import { POST } from "@/app/api/daa/workbench/execution/preview/route";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { getDaaSystemConfig, listDaaAssetUniverse, listDaaFxRates, updateDaaAssetUniverseLastPrice } from "@/src/daa/store/daaStorePg";

const MARKET_CACHE_CONFIG = {
  freshMinutes: 15,
  serveStaleHours: 48,
  rawRetentionDays: 90,
} as const;

function buildPreviewConfig(input?: {
  priceFeedEnabled?: boolean;
}) {
  return buildSystemConfigRow({
    strategy: {
      constraints: {
        tradeFeeRateBps: 5,
      },
    },
    dataSources: {
      priceFeed: {
        enabled: input?.priceFeedEnabled ?? true,
        marketCache: MARKET_CACHE_CONFIG,
      },
    },
  });
}

function buildPreviewBootstrap(input?: {
  cash?: number;
  totalEquity?: number | null;
  assets?: Array<ReturnType<typeof buildAssetUniverseView>>;
}) {
  const cash = input?.cash ?? 10000;
  return buildWorkbenchBootstrapFixture({
    account: {
      cash,
      investableCash: cash,
      frozenCash: 0,
      totalEquity: input?.totalEquity ?? cash,
    },
    assetUniverse: input?.assets ?? [],
  });
}

describe("workbench-market-preview-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildPreviewConfig());
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({});
  });

  it("高波动与价格过旧保留为提示，但现金不足会禁止提交", async () => {
    const stalePriceUpdatedAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildPreviewBootstrap({
      cash: 50,
      totalEquity: 50,
      assets: [
        buildAssetUniverseView({
          assetKey: "CRYPTO::BTC-USD",
          symbol: "BTC-USD",
          market: "CRYPTO",
          currency: "USD",
          assetClass: "CRYPTO",
          region: "GLOBAL",
          exchange: "COINBASE",
          instrumentType: "CRYPTO",
          marketGroup: "CRYPTO",
          yfinanceSymbol: "BTC-USD",
          lastPrice: 100,
          priceUpdatedAt: stalePriceUpdatedAt,
        }),
      ],
    }));

    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({
        assetKey: "CRYPTO::BTC-USD",
        symbol: "BTC-USD",
        market: "CRYPTO",
        currency: "USD",
        assetClass: "CRYPTO",
        region: "GLOBAL",
        exchange: "COINBASE",
        instrumentType: "CRYPTO",
        marketGroup: "CRYPTO",
        lastPrice: 100,
        priceUpdatedAt: stalePriceUpdatedAt,
      }),
    ]);
    vi.mocked(listDaaFxRates).mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "CRYPTO::BTC-USD",
        side: "BUY",
        qty: 1,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.canSubmit).toBe(false);
    expect(json.data.warnings.some((item: string) => item.includes("现金不足"))).toBe(true);
    expect(json.data.warnings.some((item: string) => item.includes("行情抓取时间超过 6 小时"))).toBe(true);
    expect(json.data.warnings.some((item: string) => item.includes("高波动资产"))).toBe(true);
    expect(json.data.warnings.some((item: string) => item.includes("集中度偏高"))).toBe(true);
  });

  it("行情源关闭时不再发起实时刷新，并沿用本地价格预览", async () => {
    const stalePriceUpdatedAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildPreviewConfig({ priceFeedEnabled: false }));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildPreviewBootstrap({
      assets: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          market: "US",
          currency: "USD",
          lastPrice: 100,
          priceUpdatedAt: stalePriceUpdatedAt,
        }),
      ],
    }));
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        lastPrice: 100,
        priceUpdatedAt: stalePriceUpdatedAt,
      }),
    ]);
    vi.mocked(listDaaFxRates).mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "US::AAPL",
        side: "BUY",
        qty: 1,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.price).toBe(100);
    expect(json.data.warnings.some((item: string) => item.includes("行情源已关闭"))).toBe(true);
    expect(vi.mocked(getMarketPricesWithCache)).not.toHaveBeenCalled();
  });

  it("会优先使用第三方行情，失败后才回退本地缓存价", async () => {
    const stalePriceUpdatedAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildPreviewBootstrap({
      assets: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          market: "US",
          currency: "USD",
          lastPrice: 100,
          priceUpdatedAt: stalePriceUpdatedAt,
        }),
      ],
    }));
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        lastPrice: 100,
        priceUpdatedAt: stalePriceUpdatedAt,
      }),
    ]);
    vi.mocked(listDaaFxRates).mockResolvedValue([]);
    const updatedAt = new Date().toISOString();
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({
      "US::AAPL": buildMarketPriceResolved({
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 123.45,
        priceStatus: "fresh",
        priceUpdatedAt: updatedAt,
        priceAgeSec: 5,
        priceSource: "execution_preview:yfinance:AAPL",
      }),
    });

    const response = await POST(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "US::AAPL",
        side: "BUY",
        qty: 1,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.price).toBe(123.45);
    expect(json.data.priceSource).toBe("execution_preview:yfinance:AAPL");
    expect(json.data.priceSnapshotAt).toBe(updatedAt);
    expect(json.data.warnings.some((item: string) => item.includes("行情抓取时间超过 6 小时"))).toBe(false);
    expect(json.data).not.toHaveProperty("priceFetchedAt");
    expect(json.data).not.toHaveProperty("priceAsOf");
    expect(vi.mocked(updateDaaAssetUniverseLastPrice)).toHaveBeenCalledWith({
      assetKey: "US::AAPL",
      lastPrice: 123.45,
      priceUpdatedAt: updatedAt,
    });
  });

  it("缺少行情时间时不再伪造 priceSnapshotAt", async () => {
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildPreviewBootstrap({
      assets: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          market: "US",
          currency: "USD",
          lastPrice: 100,
          priceUpdatedAt: null,
        }),
      ],
    }));
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        lastPrice: 100,
        priceUpdatedAt: null,
      }),
    ]);
    vi.mocked(listDaaFxRates).mockResolvedValue([]);
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({
      "US::AAPL": buildMarketPriceResolved({
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 123.45,
        priceStatus: "fresh",
        priceUpdatedAt: null,
        priceAgeSec: null,
        priceSource: "execution_preview:yfinance:AAPL",
      }),
    });

    const response = await POST(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "US::AAPL",
        side: "BUY",
        qty: 1,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.price).toBe(123.45);
    expect(json.data.priceSnapshotAt).toBeNull();
    expect(vi.mocked(updateDaaAssetUniverseLastPrice)).not.toHaveBeenCalled();
  });

  it("缺少 FX 时返回提示但不阻断预览", async () => {
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildPreviewBootstrap());
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({
        assetKey: "HK::700",
        symbol: "700",
        market: "HK",
        currency: "HKD",
        assetClass: "EQUITY",
        region: "HK",
        exchange: "HKEX",
        instrumentType: "STOCK",
        marketGroup: "HK_EQUITY",
      }),
    ]);
    vi.mocked(listDaaFxRates).mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "HK::700",
        side: "BUY",
        qty: 1,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.canSubmit).toBe(false);
    expect(json.data.warnings.some((item: string) => item.includes("缺少汇率 HKD/USD"))).toBe(true);
  });

  it("价格缺失且第三方与缓存都不可用时阻断提交", async () => {
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildPreviewBootstrap());
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        lastPrice: 0,
        priceUpdatedAt: null,
      }),
    ]);
    vi.mocked(listDaaFxRates).mockResolvedValue([]);
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({
      "US::AAPL": buildMarketPriceResolved({
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 0,
        priceStatus: "missing",
        priceUpdatedAt: null,
        priceAgeSec: null,
        priceSource: "execution_preview:yfinance:AAPL",
      }),
    });

    const response = await POST(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "US::AAPL",
        side: "BUY",
        qty: 1,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(json.error.details.reasonCode).toBe("PRICE_FETCH_TIMEOUT");
    expect(vi.mocked(updateDaaAssetUniverseLastPrice)).not.toHaveBeenCalled();
  });
});
