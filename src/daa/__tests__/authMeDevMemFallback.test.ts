import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/src/daa/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseFromRequest: vi.fn(),
}));

import { GET } from "@/app/api/daa/auth/me/route";

describe("auth-me-devmem-fallback-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("silent 模式下未登录返回 not_authenticated with 200", async () => {
    mocks.createSupabaseServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: { message: "not authenticated" },
        })),
      },
    });

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
    mocks.createSupabaseServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: { message: "not authenticated" },
        })),
      },
    });

    const response = await GET(new Request("http://localhost/api/daa/auth/me"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe("not_authenticated");
  });

  it("已登录返回用户信息", async () => {
    mocks.createSupabaseServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "user-1",
              email: "admin@example.com",
              app_metadata: { roles: ["editor"] },
              created_at: "2026-01-01T00:00:00Z",
            },
          },
          error: null,
        })),
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
