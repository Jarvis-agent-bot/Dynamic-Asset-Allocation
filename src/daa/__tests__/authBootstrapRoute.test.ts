import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bootstrapCreateFirstDaaAuthAccount: vi.fn(),
}));

vi.mock("@/src/daa/auth/daaAuthStore", () => ({
  bootstrapCreateFirstDaaAuthAccount: mocks.bootstrapCreateFirstDaaAuthAccount,
}));

import { POST as bootstrapPost } from "@/app/api/daa/auth/bootstrap/route";
import { _resetRateLimit } from "@/src/daa/api/rateLimit";

describe("auth-bootstrap-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimit("bootstrap");
  });

  it("缺少 username/email 或 password 时返回 400", async () => {
    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "", password: "" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });

  it("本地数据库不可用时返回 503", async () => {
    mocks.bootstrapCreateFirstDaaAuthAccount.mockRejectedValue(new Error("DAA Postgres not configured"));

    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin@example.com", password: "pw-1" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe("auth_backend_unavailable");
  });

  it("成功创建首个管理员", async () => {
    mocks.bootstrapCreateFirstDaaAuthAccount.mockResolvedValue({
      accountId: "user-1",
      username: "admin@example.com",
      roles: ["editor"],
      status: "active",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin@example.com", password: "pw-1", roles: ["editor"] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      data: {
        bootstrapped: true,
        account: {
          username: "admin@example.com",
          roles: ["editor"],
        },
      },
    });
  });

  it("重复创建用户返回 403", async () => {
    mocks.bootstrapCreateFirstDaaAuthAccount.mockRejectedValue(new Error("bootstrap not allowed: accounts already exist"));

    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin@example.com", password: "pw-1" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });
});
