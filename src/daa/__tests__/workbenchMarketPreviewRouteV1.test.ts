import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheServiceV1", () => ({
  getMarketPricesWithCacheV1: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchServiceV1", () => ({
  buildWorkbenchBootstrapV1: vi.fn(),
  validateExecutionRiskV1: vi.fn(async () => ({
    overallStatus: "warn",
    items: [],
  })),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  getDaaSystemConfigV2: vi.fn(),
  listDaaFxRatesV1: vi.fn(),
  listDaaAssetUniverseV1: vi.fn(),
  updateDaaAssetUniverseLastPriceV1: vi.fn(),
}));

import { POST } from "@/app/api/daa/workbench/execution/preview/route";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { getDaaSystemConfigV2, listDaaAssetUniverseV1, listDaaFxRatesV1, updateDaaAssetUniverseLastPriceV1 } from "@/src/daa/store/daaStorePgV1";

describe("workbench-market-preview-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue({
      config: {
        strategy: {
          constraints: {
            tradeFeeRateBps: 5,
          },
        },
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
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({});
  });

  it("高波动与价格过旧保留为提示，但现金不足会禁止提交", async () => {
    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 50, investableCash: 50, frozenCash: 0, totalEquity: 50 },
      assetUniverse: [{
        assetKey: "CRYPTO::BTC-USD",
        symbol: "BTC-USD",
        market: "CRYPTO",
        currency: "USD",
        assetClass: "CRYPTO",
        region: "GLOBAL",
        exchange: "COINBASE",
        instrumentType: "CRYPTO",
        marketGroup: "CRYPTO",
        holdingQty: 0,
        holdingPrice: 0,
        costBasis: null,
        holdingTags: [],
        watchEnabled: true,
        targetWeightHint: 0,
        watchTags: [],
        notes: null,
        lastPrice: 100,
        priceUpdatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
        valuationBase: 0,
        fxRateToBase: 1,
        fxMissing: false,
        actualWeightPct: 0,
        targetWeightPct: 0,
        gapPct: null,
      }],
      execution: {
        logs: [],
      },
      rebalance: {
        mode: "manual",
        autoAnalysisEnabled: false,
        analysisTimeUtc: "00:20",
        timezone: "Asia/Shanghai",
        emailTo: "",
        analysisFocus: "mock",
      },
      warnings: [],
    } as any);

    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([{
      assetKey: "CRYPTO::BTC-USD",
      symbol: "BTC-USD",
      market: "CRYPTO",
      currency: "USD",
      assetClass: "CRYPTO",
      region: "GLOBAL",
      exchange: "COINBASE",
      instrumentType: "CRYPTO",
      marketGroup: "CRYPTO",
      holdingQty: 0,
      holdingPrice: 0,
      costBasis: null,
      holdingTags: [],
      watchEnabled: true,
      targetWeightHint: 0,
      watchTags: [],
      notes: null,
      lastPrice: 100,
      priceUpdatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }]);
    vi.mocked(listDaaFxRatesV1).mockResolvedValue([]);

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

  it("会优先使用第三方行情，失败后才回退本地缓存价", async () => {
    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 10000, investableCash: 10000, frozenCash: 0, totalEquity: 10000 },
      assetUniverse: [{
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "EQUITY",
        region: "US",
        exchange: "NASDAQ",
        instrumentType: "STOCK",
        marketGroup: "US_EQUITY",
        holdingQty: 0,
        holdingPrice: 0,
        costBasis: null,
        holdingTags: [],
        watchEnabled: true,
        targetWeightHint: 0,
        watchTags: [],
        notes: null,
        lastPrice: 100,
        priceUpdatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
        valuationBase: 0,
        fxRateToBase: 1,
        fxMissing: false,
        actualWeightPct: 0,
        targetWeightPct: 0,
        gapPct: null,
      }],
      execution: {
        logs: [],
      },
      rebalance: {
        mode: "manual",
        autoAnalysisEnabled: false,
        analysisTimeUtc: "00:20",
        timezone: "Asia/Shanghai",
        emailTo: "",
        analysisFocus: "mock",
      },
      warnings: [],
    } as any);
    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([{
      assetKey: "US::AAPL",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
      holdingQty: 0,
      holdingPrice: 0,
      costBasis: null,
      holdingTags: [],
      watchEnabled: true,
      targetWeightHint: 0,
      watchTags: [],
      notes: null,
      lastPrice: 100,
      priceUpdatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }]);
    vi.mocked(listDaaFxRatesV1).mockResolvedValue([]);
    const updatedAt = new Date().toISOString();
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({
      "US::AAPL": {
        provider: "yfinance",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 123.45,
        priceStatus: "fresh",
        priceUpdatedAt: updatedAt,
        priceAgeSec: 5,
        priceSource: "execution_preview:yfinance:AAPL",
      },
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
    expect(vi.mocked(updateDaaAssetUniverseLastPriceV1)).toHaveBeenCalledWith({
      assetKey: "US::AAPL",
      lastPrice: 123.45,
      priceUpdatedAt: updatedAt,
    });
  });

  it("缺少行情时间时不再伪造 priceSnapshotAt", async () => {
    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 10000, investableCash: 10000, frozenCash: 0, totalEquity: 10000 },
      assetUniverse: [{
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "EQUITY",
        region: "US",
        exchange: "NASDAQ",
        instrumentType: "STOCK",
        marketGroup: "US_EQUITY",
        holdingQty: 0,
        holdingPrice: 0,
        costBasis: null,
        holdingTags: [],
        watchEnabled: true,
        targetWeightHint: 0,
        watchTags: [],
        notes: null,
        lastPrice: 100,
        priceUpdatedAt: null,
        valuationBase: 0,
        fxRateToBase: 1,
        fxMissing: false,
        actualWeightPct: 0,
        targetWeightPct: 0,
        gapPct: null,
      }],
      execution: {
        logs: [],
      },
      rebalance: {
        mode: "manual",
        autoAnalysisEnabled: false,
        analysisTimeUtc: "00:20",
        timezone: "Asia/Shanghai",
        emailTo: "",
        analysisFocus: "mock",
      },
      warnings: [],
    } as any);
    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([{
      assetKey: "US::AAPL",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
      holdingQty: 0,
      holdingPrice: 0,
      costBasis: null,
      holdingTags: [],
      watchEnabled: true,
      targetWeightHint: 0,
      watchTags: [],
      notes: null,
      lastPrice: 100,
      priceUpdatedAt: null,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }]);
    vi.mocked(listDaaFxRatesV1).mockResolvedValue([]);
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({
      "US::AAPL": {
        provider: "yfinance",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 123.45,
        priceStatus: "fresh",
        priceUpdatedAt: null,
        priceAgeSec: null,
        priceSource: "execution_preview:yfinance:AAPL",
      },
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
    expect(vi.mocked(updateDaaAssetUniverseLastPriceV1)).not.toHaveBeenCalled();
  });

  it("缺少 FX 时返回提示但不阻断预览", async () => {
    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 10000, investableCash: 10000, frozenCash: 0, totalEquity: 10000 },
      assetUniverse: [],
      execution: {
        logs: [],
      },
      rebalance: {
        mode: "manual",
        autoAnalysisEnabled: false,
        analysisTimeUtc: "00:20",
        timezone: "Asia/Shanghai",
        emailTo: "",
        analysisFocus: "mock",
      },
      warnings: [],
    } as any);
    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([{
      assetKey: "HK::700",
      symbol: "700",
      market: "HK",
      currency: "HKD",
      assetClass: "EQUITY",
      region: "HK",
      exchange: "HKEX",
      instrumentType: "STOCK",
      marketGroup: "HK_EQUITY",
      holdingQty: 0,
      holdingPrice: 0,
      costBasis: null,
      holdingTags: [],
      watchEnabled: true,
      targetWeightHint: 0,
      watchTags: [],
      notes: null,
      lastPrice: 100,
      priceUpdatedAt: "2026-03-01T00:00:00.000Z",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }]);
    vi.mocked(listDaaFxRatesV1).mockResolvedValue([]);

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
    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 10000, investableCash: 10000, frozenCash: 0, totalEquity: 10000 },
      assetUniverse: [],
      execution: {
        logs: [],
      },
      rebalance: {
        mode: "manual",
        autoAnalysisEnabled: false,
        analysisTimeUtc: "00:20",
        timezone: "Asia/Shanghai",
        emailTo: "",
        analysisFocus: "mock",
      },
      warnings: [],
    } as any);
    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([{
      assetKey: "US::AAPL",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
      holdingQty: 0,
      holdingPrice: 0,
      costBasis: null,
      holdingTags: [],
      watchEnabled: true,
      targetWeightHint: 0,
      watchTags: [],
      notes: null,
      lastPrice: 0,
      priceUpdatedAt: null,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }]);
    vi.mocked(listDaaFxRatesV1).mockResolvedValue([]);
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({
      "US::AAPL": {
        provider: "yfinance",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 0,
        priceStatus: "missing",
        priceUpdatedAt: null,
        priceAgeSec: null,
        priceSource: "execution_preview:yfinance:AAPL",
      },
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
    expect(vi.mocked(updateDaaAssetUniverseLastPriceV1)).not.toHaveBeenCalled();
  });
});
