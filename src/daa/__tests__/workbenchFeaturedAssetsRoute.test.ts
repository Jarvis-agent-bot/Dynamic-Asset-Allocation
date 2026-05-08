import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMarketPriceResolved,
  buildSystemConfigRow,
} from "@/src/daa/__tests__/testDataFactories";
import type { MarketPriceResolved } from "@/src/daa/modules/marketCache/marketCacheService";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheService", () => ({
  getMarketPricesWithCache: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
}));

import { GET } from "@/app/api/daa/workbench/featured-assets/route";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

describe("workbench-featured-assets-route-v1", () => {
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
    vi.mocked(getMarketPricesWithCache).mockImplementation(async (input: { assets?: Array<{ market: string; symbol: string; currency?: string }> }) => {
      const out: Record<string, MarketPriceResolved> = {};
      for (const row of input.assets || []) {
        out[`${String(row.market || "").toUpperCase()}::${String(row.symbol || "").toUpperCase()}`] = buildMarketPriceResolved({
          provider: "yfinance",
          market: String(row.market || "").toUpperCase(),
          symbol: String(row.symbol || "").toUpperCase(),
          currency: String(row.currency || "USD").toUpperCase(),
          price: 123.45,
          priceStatus: "fresh",
          priceUpdatedAt: "2026-03-06T08:00:00.000Z",
          priceAgeSec: 0,
          priceSource: "test",
        });
      }
      return out;
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
    expect(json.data.groups.map((group: { market: string }) => group.market)).toEqual(["US", "HK", "CN", "KR"]);
    expect(json.data.groups[0]?.items[0]).toMatchObject({
      market: "US",
      assetClass: "EQUITY",
      themeKey: expect.any(String),
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

  it("theme=semiconductor 返回半导体主题资产", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?theme=semiconductor&limitPerMarket=20"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups.length).toBeGreaterThan(0);
    expect(json.data.groups.flatMap((group: { items: Array<{ themeKey: string }> }) => group.items)
      .every((item: { themeKey: string }) => item.themeKey === "semiconductor")).toBe(true);
  });

  it.each([
    ["ai_infrastructure", "AI基础设施"],
    ["optical_networking", "光互联/网络"],
    ["power_grid", "电力/电网"],
    ["robotics", "机器人/自动化"],
    ["cybersecurity", "网络安全"],
    ["ai_software", "AI应用软件"],
    ["global_region", "全球区域"],
  ])("theme=%s 返回对应主题资产", async (theme, label) => {
    const response = await GET(new Request(`http://localhost/api/daa/workbench/featured-assets?theme=${theme}&limitPerMarket=20`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    const items = json.data.groups.flatMap((group: { items: Array<{ themeKey: string; themeLabelZh: string }> }) => group.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item: { themeKey: string; themeLabelZh: string }) => item.themeKey === theme && item.themeLabelZh === label)).toBe(true);
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
    expect(vi.mocked(getMarketPricesWithCache)).toHaveBeenCalledWith(expect.objectContaining({
      forceRefresh: true,
      source: "featured_assets",
    }));
  });

  it("行情失败时仍返回推荐项且价格置 0", async () => {
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({
      "US::AAPL": buildMarketPriceResolved({
        market: "US",
        symbol: "AAPL",
        currency: "USD",
        price: 0,
        priceStatus: "missing",
        priceUpdatedAt: null,
        priceAgeSec: null,
        priceSource: "test",
      }),
    });

    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?market=US&limitPerMarket=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups[0]?.items.length).toBe(1);
    expect(json.data.groups[0]?.items[0]?.price).toBe(0);
  });
});
