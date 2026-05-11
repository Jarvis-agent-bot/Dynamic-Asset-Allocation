import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssetUniverseRow, buildSystemConfigRow } from "@/src/daa/__tests__/testDataFactories";

vi.mock("@/src/daa/cron/auth", () => ({
  requireCronAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
  listDaaAssetUniverse: vi.fn(),
}));

vi.mock("@/src/market/yahooRssFetch", () => ({
  parseSymbolsFromNewsQuery: vi.fn(),
}));

import { GET } from "@/app/api/daa/news/subscribed-symbols/route";
import { getDaaSystemConfig, listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";

describe("news subscribed symbols route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      dataSources: {
        newsFeed: {
          enabled: true,
          symbols: [],
          query: "",
        },
      },
    }));
    vi.mocked(parseSymbolsFromNewsQuery).mockReturnValue([]);
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([]);
  });

  it("实时新闻订阅按 market 判断 US，而不是按 region 判断", async () => {
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({
        assetKey: "HK::0700.HK",
        symbol: "0700.HK",
        market: "HK",
        region: "US",
        holdingQty: 1,
        watchEnabled: true,
      }),
      buildAssetUniverseRow({
        assetKey: "US::TSM",
        symbol: "TSM",
        market: "US",
        region: "CN",
        holdingQty: 0,
        watchEnabled: true,
      }),
    ]);

    const response = await GET(new Request("http://localhost/api/daa/news/subscribed-symbols"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.symbols).toEqual(["TSM"]);
  });
});
