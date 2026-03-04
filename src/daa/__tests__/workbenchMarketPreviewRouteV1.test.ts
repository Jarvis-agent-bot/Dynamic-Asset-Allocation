import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/workbench/workbenchServiceV1", () => ({
  buildWorkbenchBootstrapV1: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  listDaaFxRatesV1: vi.fn(),
  listDaaAssetUniverseV1: vi.fn(),
  updateDaaAssetUniverseLastPriceV1: vi.fn(),
}));

vi.mock("@/src/market/yfinanceFetchV1", () => ({
  fetchYfinanceLatestCloseV1: vi.fn(),
}));

import { POST } from "@/app/api/daa/workbench/execution/preview/route";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { listDaaAssetUniverseV1, listDaaFxRatesV1, updateDaaAssetUniverseLastPriceV1 } from "@/src/daa/store/daaStorePgV1";
import { fetchYfinanceLatestCloseV1 } from "@/src/market/yfinanceFetchV1";

describe("workbench-market-preview-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("高波动/价格过旧/集中度/现金不足仅提示不阻断", async () => {
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
        queueId: null,
        queueStatus: null,
        queueSource: null,
        queueItems: [],
        logs: [],
      },
      warnings: [],
    });

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
    expect(json.data.canSubmit).toBe(true);
    expect(json.data.warnings.some((item: string) => item.includes("现金不足"))).toBe(true);
    expect(json.data.warnings.some((item: string) => item.includes("价格快照超过 6 小时"))).toBe(true);
    expect(json.data.warnings.some((item: string) => item.includes("高波动资产"))).toBe(true);
    expect(json.data.warnings.some((item: string) => item.includes("集中度偏高"))).toBe(true);
  });

  it("缺少 FX 时返回提示但不阻断预览", async () => {
    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 10000, investableCash: 10000, frozenCash: 0, totalEquity: 10000 },
      assetUniverse: [],
      execution: {
        queueId: null,
        queueStatus: null,
        queueSource: null,
        queueItems: [],
        logs: [],
      },
      warnings: [],
    });
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
    expect(json.data.canSubmit).toBe(true);
    expect(json.data.warnings.some((item: string) => item.includes("缺少汇率 HKD/USD"))).toBe(true);
  });

  it("价格缺失且自动拉价失败时阻断提交", async () => {
    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 10000, investableCash: 10000, frozenCash: 0, totalEquity: 10000 },
      assetUniverse: [],
      execution: {
        queueId: null,
        queueStatus: null,
        queueSource: null,
        queueItems: [],
        logs: [],
      },
      warnings: [],
    });
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
    vi.mocked(fetchYfinanceLatestCloseV1).mockResolvedValue(null);

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
