import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaaAuthAccount, DaaAuthSession } from "@/src/daa/auth/daaAuthStore";

type DaaAuthContext = { token: string; account: DaaAuthAccount; session: DaaAuthSession } | null;

const mocks = vi.hoisted(() => ({
  requireDaaAdminEditorAuth: vi.fn(async () => null),
  getDaaAuthContextFromRequest: vi.fn<() => Promise<DaaAuthContext>>(async () => null),
  createDaaAuthAccount: vi.fn(),
  deleteDaaAuthAccount: vi.fn(),
  listDaaAuthAccounts: vi.fn(),
  resetDaaAuthAccountPassword: vi.fn(),
  updateDaaAuthAccount: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminEditorAuth: mocks.requireDaaAdminEditorAuth,
}));

vi.mock("@/src/daa/auth/daaAuthRequest", () => ({
  getDaaAuthContextFromRequest: mocks.getDaaAuthContextFromRequest,
}));

vi.mock("@/src/daa/auth/daaAuthStore", () => ({
  createDaaAuthAccount: mocks.createDaaAuthAccount,
  deleteDaaAuthAccount: mocks.deleteDaaAuthAccount,
  listDaaAuthAccounts: mocks.listDaaAuthAccounts,
  resetDaaAuthAccountPassword: mocks.resetDaaAuthAccountPassword,
  updateDaaAuthAccount: mocks.updateDaaAuthAccount,
}));

import { GET, POST } from "@/app/api/daa/auth/accounts/route";
import { DELETE, PATCH } from "@/app/api/daa/auth/accounts/[accountId]/route";

const account: DaaAuthAccount = {
  accountId: "acct-1",
  username: "admin@example.com",
  roles: ["editor"],
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("auth accounts routes v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists local auth accounts without password hashes", async () => {
    mocks.listDaaAuthAccounts.mockResolvedValue([account]);

    const response = await GET(new Request("http://localhost/api/daa/auth/accounts"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.accounts).toEqual([account]);
    expect(JSON.stringify(json)).not.toContain("password");
  });

  it("creates a local auth account", async () => {
    mocks.createDaaAuthAccount.mockResolvedValue(account);

    const response = await POST(new Request("http://localhost/api/daa/auth/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin@example.com", password: "pw-1", roles: ["editor"] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.account).toEqual(account);
    expect(mocks.createDaaAuthAccount).toHaveBeenCalledWith({
      username: "admin@example.com",
      password: "pw-1",
      roles: ["editor"],
    });
  });

  it("updates role/status and can reset password", async () => {
    mocks.updateDaaAuthAccount.mockResolvedValue({ ok: true, account });
    mocks.resetDaaAuthAccountPassword.mockResolvedValue({ ok: true, account: { ...account, updatedAt: "2026-01-02T00:00:00Z" } });

    const response = await PATCH(new Request("http://localhost/api/daa/auth/accounts/acct-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: ["viewer"], status: "active", password: "pw-2" }),
    }), { params: { accountId: "acct-1" } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.account.accountId).toBe("acct-1");
    expect(mocks.updateDaaAuthAccount).toHaveBeenCalledWith({ accountId: "acct-1", roles: ["viewer"], status: "active" });
    expect(mocks.resetDaaAuthAccountPassword).toHaveBeenCalledWith({ accountId: "acct-1", password: "pw-2" });
  });

  it("账号更新遇到 auth 数据库未配置时返回 503", async () => {
    mocks.updateDaaAuthAccount.mockRejectedValue(new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)"));

    const response = await PATCH(new Request("http://localhost/api/daa/auth/accounts/acct-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    }), { params: { accountId: "acct-1" } });
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.code).toBe("DB_ERROR");
    expect(json.error.message).toBe("auth_backend_unavailable");
  });

  it("prevents deleting the current account", async () => {
    mocks.getDaaAuthContextFromRequest.mockResolvedValue({
      token: "session-token-1",
      account,
      session: {
        sessionId: "session-1",
        accountId: "acct-1",
        createdAt: "2026-01-01T00:00:00Z",
        expiresAt: "2026-02-01T00:00:00Z",
        revokedAt: null,
        lastSeenAt: null,
        userAgent: null,
        ip: null,
      },
    });

    const response = await DELETE(new Request("http://localhost/api/daa/auth/accounts/acct-1", {
      method: "DELETE",
    }), { params: { accountId: "acct-1" } });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe("cannot_delete_current_account");
    expect(mocks.deleteDaaAuthAccount).not.toHaveBeenCalled();
  });
});
