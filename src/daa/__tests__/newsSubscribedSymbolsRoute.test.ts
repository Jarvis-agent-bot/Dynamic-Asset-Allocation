import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssetUniverseView, buildSystemConfigRow } from "@/src/daa/__tests__/testDataFactories";

vi.mock("@/src/daa/cron/auth", () => ({
  requireCronAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn(),
}));

vi.mock("@/src/market/yahooRssFetch", () => ({
  parseSymbolsFromNewsQuery: vi.fn(),
}));

import { GET } from "@/app/api/daa/news/subscribed-symbols/route";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
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
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue({
      baseCurrency: "USD",
      assetUniverse: [],
    } as never);
  });

  it("实时新闻订阅按 market 判断 US，而不是按 region 判断", async () => {
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue({
      baseCurrency: "USD",
      assetUniverse: [
      buildAssetUniverseView({
        assetKey: "HK::0700.HK",
        symbol: "0700.HK",
        market: "HK",
        region: "US",
        holdingQty: 1,
        valuationBase: 100,
        actualWeightPct: 1,
        watchEnabled: true,
      }),
      buildAssetUniverseView({
        assetKey: "US::TSM",
        symbol: "TSM",
        market: "US",
        region: "CN",
        holdingQty: 0,
        watchEnabled: true,
      }),
      ],
    } as never);

    const response = await GET(new Request("http://localhost/api/daa/news/subscribed-symbols"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.symbols).toEqual(["TSM"]);
  });

  it("实时新闻订阅忽略已移出观察列表的微小残留仓位", async () => {
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue({
      baseCurrency: "USD",
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::BABA",
          symbol: "BABA",
          market: "US",
          holdingQty: 0.00000066,
          valuationBase: 0.00001,
          actualWeightPct: 0.0000001,
          watchEnabled: false,
        }),
      ],
    } as never);

    const response = await GET(new Request("http://localhost/api/daa/news/subscribed-symbols"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.symbols).toEqual([]);
  });
});
