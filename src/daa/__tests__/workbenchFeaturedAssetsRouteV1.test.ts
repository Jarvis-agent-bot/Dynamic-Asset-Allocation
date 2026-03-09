import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheServiceV1", () => ({
  getMarketPricesWithCacheV1: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  getDaaSystemConfigV2: vi.fn(),
}));

import { GET } from "@/app/api/daa/workbench/featured-assets/route";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

describe("workbench-featured-assets-route-v1", () => {
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
    vi.mocked(getMarketPricesWithCacheV1).mockImplementation(async (input: { assets?: Array<{ market: string; symbol: string; currency?: string }> }) => {
      const out: Record<string, unknown> = {};
      for (const row of input.assets || []) {
        out[`${String(row.market || "").toUpperCase()}::${String(row.symbol || "").toUpperCase()}`] = {
          provider: "yfinance",
          market: String(row.market || "").toUpperCase(),
          symbol: String(row.symbol || "").toUpperCase(),
          currency: String(row.currency || "USD").toUpperCase(),
          price: 123.45,
          priceStatus: "fresh",
          priceUpdatedAt: "2026-03-06T08:00:00.000Z",
          priceAgeSec: 0,
          priceSource: "test",
        };
      }
      return out as any;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("默认参数返回股票分组", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.groups)).toBe(true);
    expect(json.data.groups.map((group: { market: string }) => group.market)).toEqual(["US", "HK", "CN"]);
    expect(json.data.groups[0]?.items[0]).toMatchObject({
      market: "US",
      assetClass: "EQUITY",
    });
  });

  it("market=US 仅返回美股分组", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?market=US"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups.length).toBe(1);
    expect(json.data.groups[0]?.market).toBe("US");
  });

  it("assetClass=CRYPTO 返回加密分组", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?assetClass=CRYPTO"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups.length).toBe(1);
    expect(json.data.groups[0]?.market).toBe("CRYPTO");
    expect(json.data.groups[0]?.items.every((item: { assetClass: string }) => item.assetClass === "CRYPTO")).toBe(true);
  });

  it("limitPerMarket 生效", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?limitPerMarket=2"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups.length).toBeGreaterThan(0);
    expect(json.data.groups.every((group: { items: unknown[] }) => group.items.length <= 2)).toBe(true);
  });

  it("推荐资产优先使用统一行情服务返回的价格与抓取时间", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?market=US&limitPerMarket=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups[0]?.items[0]).toMatchObject({
      market: "US",
      price: 123.45,
      priceStatus: "fresh",
      priceUpdatedAt: "2026-03-06T08:00:00.000Z",
      priceSource: "test",
    });
    expect(json.data.groups[0]?.items[0]).not.toHaveProperty("priceFetchedAt");
    expect(json.data.groups[0]?.items[0]).not.toHaveProperty("priceAsOf");
    expect(vi.mocked(getMarketPricesWithCacheV1)).toHaveBeenCalledWith(expect.objectContaining({
      forceRefresh: true,
      source: "featured_assets",
    }));
  });

  it("行情失败时仍返回推荐项且价格置 0", async () => {
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({
      "US::AAPL": {
        provider: "yfinance",
        market: "US",
        symbol: "AAPL",
        currency: "USD",
        price: 0,
        priceStatus: "missing",
        priceUpdatedAt: null,
        priceAgeSec: null,
        priceSource: "test",
      },
    } as any);

    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?market=US&limitPerMarket=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups[0]?.items.length).toBe(1);
    expect(json.data.groups[0]?.items[0]?.price).toBe(0);
  });
});
