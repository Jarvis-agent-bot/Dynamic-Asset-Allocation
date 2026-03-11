import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDaaAdminViewerAuth: vi.fn(),
  buildStrategyLabSeedReadModelV1: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: mocks.requireDaaAdminViewerAuth,
}));

vi.mock("@/src/daa/modules/read/strategyLabSeedReadServiceV1", () => ({
  buildStrategyLabSeedReadModelV1: mocks.buildStrategyLabSeedReadModelV1,
}));

import { GET } from "@/app/api/daa/read/strategy-lab-seed/route";

describe("strategy-lab-seed-route-devmem-fallback-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DAA_PG_MEM = "1";
    mocks.requireDaaAdminViewerAuth.mockResolvedValue(null);
  });

  it("seed 读接口在 dev:mem store 缺失时回退到空 seed model", async () => {
    mocks.buildStrategyLabSeedReadModelV1.mockRejectedValue(new Error('database "daa" does not exist'));

    const response = await GET(new Request("http://localhost/api/daa/read/strategy-lab-seed"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.baseCurrency).toBe("USD");
    expect(json.data.availableAssets).toEqual([]);
    expect(json.data.selectedAssetKeys).toEqual([]);
  });
});
