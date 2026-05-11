import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMarketPriceResolved,
  buildSystemConfigRow,
} from "@/src/daa/__tests__/testDataFactories";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheService", () => ({
  getMarketPricesWithCache: vi.fn(async () => ({})),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
}));

import { GET } from "@/app/api/daa/workbench/search-assets/route";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

describe("workbench-search-assets-route-v1", () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("q 为空时返回 400", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/search-assets"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });

  it("按市场/资产类型/地区筛选并返回标准化字段", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        quotes: [
          {
            symbol: "0700.HK",
            exchange: "HKG",
            currency: "HKD",
            regularMarketPrice: 320.5,
            shortname: "Tencent",
            quoteType: "EQUITY",
            region: "HK",
          },
          {
            symbol: "AAPL",
            exchange: "NMS",
            currency: "USD",
            regularMarketPrice: 180.3,
            shortname: "Apple",
            quoteType: "EQUITY",
            region: "US",
          },
        ],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/daa/workbench/search-assets?q=tencent&market=HK&assetClass=EQUITY&region=HK&limit=10"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.items)).toBe(true);
    expect(json.data.items.length).toBe(1);
    expect(json.data.items[0]).toMatchObject({
      symbol: "0700.HK",
      market: "HK",
      currency: "HKD",
      name: "Tencent",
      displayNameZh: "腾讯控股",
      assetClass: "EQUITY",
      region: "HK",
      yfinanceSymbol: "0700.HK",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("搜索结果优先使用统一行情服务返回的价格", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      quotes: [
        {
          symbol: "AAPL",
          exchange: "NMS",
          currency: "USD",
          regularMarketPrice: 180.3,
          shortname: "Apple",
          quoteType: "EQUITY",
          region: "US",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const updatedAt = new Date().toISOString();
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({
      "US::AAPL": buildMarketPriceResolved({
        provider: "yfinance",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 181.8,
        priceStatus: "fresh",
        priceUpdatedAt: updatedAt,
        priceAgeSec: 3,
        priceSource: "search_assets:yfinance:AAPL",
      }),
    });

    const response = await GET(new Request("http://localhost/api/daa/workbench/search-assets?q=aapl&market=US&assetClass=EQUITY&region=US&limit=10"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items[0]).toMatchObject({
      symbol: "AAPL",
      price: 181.8,
      priceStatus: "fresh",
      priceUpdatedAt: updatedAt,
      priceSource: "search_assets:yfinance:AAPL",
    });
    expect(json.data.items[0]).not.toHaveProperty("priceFetchedAt");
    expect(json.data.items[0]).not.toHaveProperty("priceAsOf");
    expect(vi.mocked(getMarketPricesWithCache)).toHaveBeenCalledWith(expect.objectContaining({
      forceRefresh: true,
      refreshBudget: 1,
      source: "search_assets",
    }));
  });

  it("行情源关闭时仍可搜索，但价格富化只读缓存不触发实时刷新", async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
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
    }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      quotes: [
        {
          symbol: "AAPL",
          exchange: "NMS",
          currency: "USD",
          regularMarketPrice: 180.3,
          shortname: "Apple",
          quoteType: "EQUITY",
          region: "US",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/daa/workbench/search-assets?q=aapl&market=US&assetClass=EQUITY&region=US&limit=10"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items[0]).toMatchObject({ symbol: "AAPL", price: 180.3 });
    expect(vi.mocked(getMarketPricesWithCache)).toHaveBeenCalledWith(expect.objectContaining({
      allowRefresh: false,
      forceRefresh: false,
      source: "search_assets",
    }));
  });

  it("同 symbol 的不同市场不互相去重", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      quotes: [
        {
          symbol: "700",
          exchange: "Hong Kong Stock Exchange",
          currency: "HKD",
          regularMarketPrice: 320.5,
          shortname: "Tencent HK",
          quoteType: "EQUITY",
        },
        {
          symbol: "700",
          exchange: "SSE",
          currency: "CNY",
          regularMarketPrice: 95.2,
          shortname: "Tencent CN",
          quoteType: "EQUITY",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/daa/workbench/search-assets?q=700&market=ALL&assetClass=ALL&region=ALL&limit=10"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items.length).toBe(2);
    expect(new Set(json.data.items.map((item: { market: string }) => item.market))).toEqual(new Set(["HK", "CN"]));
  });

  it("允许白名单商品期货作为独立黄金配置品种", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      quotes: [
        {
          symbol: "GC=F",
          exchange: "CMX",
          exchDisp: "COMEX",
          currency: "USD",
          regularMarketPrice: 2350.8,
          shortname: "Gold Jun 26",
          longname: "Gold Futures Continuous Contract",
          quoteType: "FUTURE",
          typeDisp: "Futures",
        },
        {
          symbol: "ES=F",
          exchange: "CME",
          currency: "USD",
          regularMarketPrice: 5200,
          shortname: "S&P 500 Futures",
          quoteType: "FUTURE",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/daa/workbench/search-assets?q=gold&market=COMMODITY&assetClass=COMMODITY&region=GLOBAL&limit=10"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0]).toMatchObject({
      symbol: "GC=F",
      market: "COMMODITY",
      currency: "USD",
      displayNameZh: "黄金",
      assetClass: "COMMODITY",
      region: "GLOBAL",
      instrumentType: "COMMODITY",
      yfinanceSymbol: "GC=F",
    });
  });
});
