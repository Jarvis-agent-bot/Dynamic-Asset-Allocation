import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

import { GET } from "@/app/api/daa/workbench/search-assets/route";

describe("workbench-search-assets-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      assetClass: "EQUITY",
      region: "HK",
      yfinanceSymbol: "0700.HK",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
});
