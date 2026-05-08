import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDaaAuthContextFromRequest: vi.fn(),
}));

vi.mock("@/src/daa/auth/daaAuthRequest", () => ({
  getDaaAuthContextFromRequest: mocks.getDaaAuthContextFromRequest,
}));

import { GET } from "@/app/api/daa/auth/me/route";

describe("auth-me-local-session-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("silent 模式下未登录返回 not_authenticated with 200", async () => {
    mocks.getDaaAuthContextFromRequest.mockResolvedValue(null);

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
  });

  it("非 silent 模式未登录返回 401", async () => {
    mocks.getDaaAuthContextFromRequest.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/daa/auth/me"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe("not_authenticated");
  });

  it("已登录返回用户信息", async () => {
    mocks.getDaaAuthContextFromRequest.mockResolvedValue({
      token: "session-token-1",
      account: {
        accountId: "user-1",
        username: "admin@example.com",
        roles: ["editor"],
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      session: {
        sessionId: "session-1",
        accountId: "user-1",
        createdAt: "2026-01-01T00:00:00Z",
        expiresAt: "2026-02-01T00:00:00Z",
        revokedAt: null,
        lastSeenAt: "2026-01-01T00:00:00Z",
        userAgent: null,
        ip: null,
      },
    });

    const response = await GET(new Request("http://localhost/api/daa/auth/me?silent=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.account.username).toBe("admin@example.com");
    expect(json.data.account.roles).toEqual(["editor"]);
  });
});
