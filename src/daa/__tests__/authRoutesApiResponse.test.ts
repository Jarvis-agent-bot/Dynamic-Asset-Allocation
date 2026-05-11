import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendDaaAuthAuditEvent: vi.fn(async () => ({})),
  authenticateDaaAuthAccount: vi.fn(),
  createDaaAuthSession: vi.fn(),
  getDaaAuthContextFromRequest: vi.fn(),
  revokeDaaAuthSession: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/src/daa/auth/daaAuthStore", () => ({
  appendDaaAuthAuditEvent: mocks.appendDaaAuthAuditEvent,
  authenticateDaaAuthAccount: mocks.authenticateDaaAuthAccount,
  createDaaAuthSession: mocks.createDaaAuthSession,
  revokeDaaAuthSession: mocks.revokeDaaAuthSession,
}));

vi.mock("@/src/daa/auth/daaAuthRequest", () => ({
  getClientIpFromRequest: vi.fn(() => "127.0.0.1"),
  getUserAgentFromRequest: vi.fn(() => "vitest"),
  getDaaAuthContextFromRequest: mocks.getDaaAuthContextFromRequest,
}));

import { POST as loginPost } from "@/app/api/daa/auth/login/route";
import { POST as logoutPost } from "@/app/api/daa/auth/logout/route";
import { GET as meGet } from "@/app/api/daa/auth/me/route";

function mockLoginAccount(account: { accountId: string; username: string; roles: string[] }) {
  mocks.authenticateDaaAuthAccount.mockResolvedValue(account);
  mocks.createDaaAuthSession.mockResolvedValue({
    token: "session-token-1",
    session: {
      sessionId: "session-1",
      accountId: account.accountId,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-02-01T00:00:00.000Z",
      revokedAt: null,
      lastSeenAt: null,
      userAgent: "vitest",
      ip: "127.0.0.1",
    },
  });
}

describe("auth-routes-api-response-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login 返回 ApiResponse 成功结构并设置 HttpOnly session cookie", async () => {
    mockLoginAccount({
      accountId: "user-1",
      username: "admin@example.com",
      roles: ["editor"],
    });

    const response = await loginPost(new Request("http://localhost/api/daa/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin@example.com", password: "pw-1", returnTo: "/daa/dashboard" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      data: {
        account: {
          username: "admin@example.com",
          roles: ["editor"],
        },
      },
    });
    expect(json.data.redirectTo).toContain("notice=signed_in");
    expect(response.headers.get("set-cookie")).toContain("daa_auth_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("login 凭证错误时返回 401", async () => {
    mocks.authenticateDaaAuthAccount.mockResolvedValue(null);

    const response = await loginPost(new Request("http://localhost/api/daa/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin@example.com", password: "wrong" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe("invalid_credentials");
  });

  it("login 会保留 dashboard 深链 returnTo", async () => {
    mockLoginAccount({
      accountId: "user-1",
      username: "admin@example.com",
      roles: ["editor"],
    });

    const response = await loginPost(new Request("http://localhost/api/daa/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin@example.com", password: "pw-1", returnTo: "/daa/dashboard/workbench?from=login" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.redirectTo).toBe("/daa/dashboard/portfolio?notice=signed_in");
  });

  it("me silent 未登录时返回 not_authenticated", async () => {
    mocks.getDaaAuthContextFromRequest.mockResolvedValue(null);

    const response = await meGet(new Request("http://localhost/api/daa/auth/me?silent=1"));
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

  it("me 已登录时返回本地账号和 session", async () => {
    mocks.getDaaAuthContextFromRequest.mockResolvedValue({
      token: "session-token-1",
      account: {
        accountId: "user-1",
        username: "admin@example.com",
        roles: ["editor"],
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      session: {
        sessionId: "session-1",
        accountId: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
        revokedAt: null,
        lastSeenAt: "2026-01-02T00:00:00.000Z",
        userAgent: "vitest",
        ip: "127.0.0.1",
      },
    });

    const response = await meGet(new Request("http://localhost/api/daa/auth/me?silent=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.account.username).toBe("admin@example.com");
    expect(json.data.session.sessionId).toBe("session-1");
  });

  it("logout 返回 signedOut: true 并清理 session cookie", async () => {
    mocks.getDaaAuthContextFromRequest.mockResolvedValue(null);

    const response = await logoutPost(new Request("http://localhost/api/daa/auth/logout", {
      method: "POST",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      data: { signedOut: true },
    });
    expect(response.headers.get("set-cookie")).toContain("daa_auth_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
