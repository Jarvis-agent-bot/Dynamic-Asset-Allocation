import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDaaAdminViewerAuth: vi.fn(),
  requireDaaAdminEditorAuth: vi.fn(),
  getDaaSystemConfig: vi.fn(),
  patchDaaSystemConfig: vi.fn(),
  saveDaaSystemConfig: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: mocks.requireDaaAdminViewerAuth,
  requireDaaAdminEditorAuth: mocks.requireDaaAdminEditorAuth,
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: mocks.getDaaSystemConfig,
  patchDaaSystemConfig: mocks.patchDaaSystemConfig,
  saveDaaSystemConfig: mocks.saveDaaSystemConfig,
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
    mocks.getDaaSystemConfig.mockRejectedValue(new Error('database "daa" does not exist'));

    const response = await GET(new Request("http://localhost/api/daa/store/system-config"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.version).toBe(1);
    expect(json.data.config.strategy.account.baseCurrency).toBe("USD");
  });
});
