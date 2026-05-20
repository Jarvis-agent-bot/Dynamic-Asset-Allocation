import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAssetDetailReadModel: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/read/assetDetailReadService", () => ({
  buildAssetDetailReadModel: mocks.buildAssetDetailReadModel,
}));

import { GET } from "@/app/api/daa/read/asset-detail/route";

describe("asset-detail-read-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildAssetDetailReadModel.mockResolvedValue({
      assetKey: "KR::000660.KS",
      row: null,
      baseCurrency: "USD",
      account: {
        cash: 0,
        investableCash: 0,
        frozenCash: 0,
        totalEquity: null,
        valuation: undefined,
      },
      execution: {
        feeRateBps: 0,
        slippageBps: 0,
        minNotional: 0,
      },
      tradeMarkers: [],
      loadedAt: "2026-03-02T00:00:00.000Z",
    });
  });

  it("要求 assetKey 参数", async () => {
    const response = await GET(new Request("http://localhost/api/daa/read/asset-detail"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(mocks.buildAssetDetailReadModel).not.toHaveBeenCalled();
  });

  it("返回轻量资产详情模型并传递 fresh 参数", async () => {
    const response = await GET(new Request("http://localhost/api/daa/read/asset-detail?assetKey=KR%3A%3A000660.KS&fresh=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocks.buildAssetDetailReadModel).toHaveBeenCalledWith({
      assetKey: "KR::000660.KS",
      fresh: true,
    });
  });
});
