import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDevDefaultDaaAuthAccountV0: vi.fn(),
  refreshDaaAuthSessionV0: vi.fn(),
  getDaaAuthContextFromRequestV0: vi.fn(),
}));

vi.mock("@/src/daa/auth/daaAuthStoreV0", () => ({
  ensureDevDefaultDaaAuthAccountV0: mocks.ensureDevDefaultDaaAuthAccountV0,
  refreshDaaAuthSessionV0: mocks.refreshDaaAuthSessionV0,
}));

vi.mock("@/src/daa/auth/daaAuthRequestV0", () => ({
  getDaaAuthContextFromRequestV0: mocks.getDaaAuthContextFromRequestV0,
}));

import { GET } from "@/app/api/daa/auth/me/route";
import { DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";

describe("auth-me-devmem-fallback-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DAA_PG_MEM = "1";
    mocks.ensureDevDefaultDaaAuthAccountV0.mockResolvedValue(undefined);
    mocks.getDaaAuthContextFromRequestV0.mockResolvedValue(null);
    mocks.refreshDaaAuthSessionV0.mockResolvedValue(null);
  });

  it("silent 模式下鉴权后端不可用时回落到 signed-out 响应", async () => {
    mocks.ensureDevDefaultDaaAuthAccountV0.mockRejectedValue(new Error('database "daa" does not exist'));

    const response = await GET(new Request("http://localhost/api/daa/auth/me?silent=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "not_authenticated",
      },
    });
    expect(response.headers.get("set-cookie")).toContain(`${DAA_AUTH_SESSION_COOKIE_V0}=`);
  });

  it("非 silent 模式仍保留 503，避免掩盖真实后端问题", async () => {
    mocks.getDaaAuthContextFromRequestV0.mockResolvedValue({
      token: "tok-1",
      account: {
        accountId: "acc-1",
        username: "admin",
        roles: ["editor"],
        status: "active",
      },
      session: {
        sessionId: "sess-1",
        createdAt: "2026-03-01T00:00:00.000Z",
        expiresAt: "2026-03-08T00:00:00.000Z",
        revokedAt: null,
        lastSeenAt: null,
      },
    });
    mocks.refreshDaaAuthSessionV0.mockRejectedValue(new Error('database "daa" does not exist'));

    const response = await GET(new Request("http://localhost/api/daa/auth/me"));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe("auth_backend_unavailable");
  });
});
