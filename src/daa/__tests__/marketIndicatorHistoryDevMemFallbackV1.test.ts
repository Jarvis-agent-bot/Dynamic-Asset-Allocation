import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDaaAdminViewerAuth: vi.fn(),
  listMarketIndicatorHistorySeriesV1: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: mocks.requireDaaAdminViewerAuth,
}));

vi.mock("@/src/daa/modules/marketContext/marketIndicatorServiceV1", () => ({
  listMarketIndicatorHistorySeriesV1: mocks.listMarketIndicatorHistorySeriesV1,
}));

import { GET } from "@/app/api/daa/store/market-indicators/history/route";

describe("market-indicator-history-devmem-fallback-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DAA_PG_MEM = "1";
    mocks.requireDaaAdminViewerAuth.mockResolvedValue(new Response(null, { status: 401 }));
  });

  it("dev:mem 下未鉴权也返回空历史序列，避免 overview 子面板刷 401", async () => {
    const response = await GET(new Request("http://localhost/api/daa/store/market-indicators/history?keys=vix,qqq_spy_ratio&days=30&scope=us_equity"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.keys).toEqual(["vix", "qqq_spy_ratio"]);
    expect(json.data.history.vix).toEqual([]);
    expect(json.data.history.qqq_spy_ratio).toEqual([]);
    expect(mocks.listMarketIndicatorHistorySeriesV1).not.toHaveBeenCalled();
  });
});
