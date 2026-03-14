import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/src/daa/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseFromRequest: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: "n/a" } })) },
  })),
}));

import { POST as loginPost } from "@/app/api/daa/auth/login/route";
import { POST as logoutPost } from "@/app/api/daa/auth/logout/route";
import { GET as meGet } from "@/app/api/daa/auth/me/route";

function mockSignIn(user: any, error: any = null) {
  mocks.createSupabaseServerClient.mockReturnValue({
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: { user, session: user ? { access_token: "tok-1" } : null },
        error,
      })),
      signOut: vi.fn(async () => ({ error: null })),
      getUser: vi.fn(async () => ({
        data: { user },
        error: user ? null : { message: "not authenticated" },
      })),
    },
  });
}

describe("auth-routes-api-response-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login 返回 ApiResponse 成功结构", async () => {
    mockSignIn({
      id: "user-1",
      email: "admin@example.com",
      app_metadata: { roles: ["editor"] },
    });

    const response = await loginPost(new Request("http://localhost/api/daa/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pw-1", returnTo: "/daa/dashboard" }),
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
  });

  it("login 凭证错误时返回 401", async () => {
    mockSignIn(null, { message: "Invalid login credentials" });

    const response = await loginPost(new Request("http://localhost/api/daa/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "wrong" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe("invalid_credentials");
  });

  it("login 会保留 dashboard 深链 returnTo", async () => {
    mockSignIn({
      id: "user-1",
      email: "admin@example.com",
      app_metadata: { roles: ["editor"] },
    });

    const response = await loginPost(new Request("http://localhost/api/daa/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pw-1", returnTo: "/daa/dashboard/workbench?from=login" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.redirectTo).toBe("/daa/dashboard/workbench?from=login&notice=signed_in");
  });

  it("me silent 未登录时返回 not_authenticated", async () => {
    mockSignIn(null, { message: "not authenticated" });

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

  it("logout 返回 signedOut: true", async () => {
    mockSignIn(null);

    const response = await logoutPost(new Request("http://localhost/api/daa/auth/logout", {
      method: "POST",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      data: { signedOut: true },
    });
  });
});
