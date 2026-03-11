import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDaaAdminViewerAuth: vi.fn(),
  requireDaaAdminEditorAuth: vi.fn(),
  getDaaSystemConfigV2: vi.fn(),
  patchDaaSystemConfigV2: vi.fn(),
  saveDaaSystemConfigV2: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: mocks.requireDaaAdminViewerAuth,
  requireDaaAdminEditorAuth: mocks.requireDaaAdminEditorAuth,
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  getDaaSystemConfigV2: mocks.getDaaSystemConfigV2,
  patchDaaSystemConfigV2: mocks.patchDaaSystemConfigV2,
  saveDaaSystemConfigV2: mocks.saveDaaSystemConfigV2,
}));

import { GET } from "@/app/api/daa/store/system-config/route";

describe("system-config-devmem-fallback-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DAA_PG_MEM = "1";
    mocks.requireDaaAdminViewerAuth.mockResolvedValue(null);
    mocks.requireDaaAdminEditorAuth.mockResolvedValue(null);
  });

  it("GET 在 dev:mem store 缺失时返回默认配置", async () => {
    mocks.getDaaSystemConfigV2.mockRejectedValue(new Error('database "daa" does not exist'));

    const response = await GET(new Request("http://localhost/api/daa/store/system-config"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.version).toBe(1);
    expect(json.data.config.strategy.account.baseCurrency).toBe("USD");
  });
});
