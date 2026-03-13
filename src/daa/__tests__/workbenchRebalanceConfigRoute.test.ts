import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

import { GET, PATCH } from "@/app/api/daa/workbench/rebalance-config/route";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntime() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_GLOBAL_KEY];
}

describe("workbench-rebalance-config-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPgMemRuntime();
  });

  it("默认返回手动模式", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/rebalance-config"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.mode).toBe("manual");
    expect(json.data.autoAnalysisEnabled).toBe(false);
  });

  it("支持更新自动模式与邮件配置", async () => {
    const patchResponse = await PATCH(new Request("http://localhost/api/daa/workbench/rebalance-config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "auto",
        autoAnalysisEnabled: true,
        analysisTimeUtc: "00:05",
        emailTo: "ops@example.com",
      }),
    }));
    const patchJson = await patchResponse.json();

    expect(patchResponse.status).toBe(200);
    expect(patchJson.ok).toBe(true);
    expect(patchJson.data.mode).toBe("auto");
    expect(patchJson.data.autoAnalysisEnabled).toBe(true);
    expect(patchJson.data.analysisTimeUtc).toBe("00:05");
    expect(patchJson.data.emailTo).toBe("ops@example.com");

    const response = await GET(new Request("http://localhost/api/daa/workbench/rebalance-config"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.mode).toBe("auto");
    expect(json.data.autoAnalysisEnabled).toBe(true);
    expect(json.data.analysisTimeUtc).toBe("00:05");
    expect(json.data.emailTo).toBe("ops@example.com");
  });
});
