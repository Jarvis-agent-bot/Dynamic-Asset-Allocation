import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDaaAdminViewerAuth: vi.fn(),
  buildOverviewReadModel: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: mocks.requireDaaAdminViewerAuth,
}));

vi.mock("@/src/daa/modules/read/overviewReadService", () => ({
  buildOverviewReadModel: mocks.buildOverviewReadModel,
}));

import { GET } from "@/app/api/daa/read/overview/route";

describe("overview-read-route-devmem-fallback-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DAA_PG_MEM = "1";
    mocks.requireDaaAdminViewerAuth.mockResolvedValue(new Response(null, { status: 401 }));
    mocks.buildOverviewReadModel.mockResolvedValue(null);
  });

  it("dev:mem 下未鉴权时返回空 overview model，避免 dashboard 首屏刷 401", async () => {
    const response = await GET(new Request("http://localhost/api/daa/read/overview"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.bootstrap.baseCurrency).toBe("USD");
    expect(json.data.bootstrap.assetUniverse).toEqual([]);
    expect(json.data.snapshots).toEqual([]);
    expect(json.data.cashLedger).toEqual([]);
    expect(mocks.buildOverviewReadModel).not.toHaveBeenCalled();
  });

  it("dev:mem 下 store 缺失时也回退到空 overview model", async () => {
    mocks.requireDaaAdminViewerAuth.mockResolvedValue(null);
    mocks.buildOverviewReadModel.mockRejectedValue(new Error('database "daa" does not exist'));

    const response = await GET(new Request("http://localhost/api/daa/read/overview"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.bootstrap.marketDataHealth.status).toBe("down");
  });
});
