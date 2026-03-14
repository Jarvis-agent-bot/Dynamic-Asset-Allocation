import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { POST as bootstrapPost } from "@/app/api/daa/auth/bootstrap/route";

function mockAdminClient(createUserResult: any) {
  mocks.createClient.mockReturnValue({
    auth: {
      admin: {
        createUser: vi.fn(async () => createUserResult),
      },
    },
  });
}

describe("auth-bootstrap-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("缺少 email 或 password 时返回 400", async () => {
    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "", password: "" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });

  it("缺少 service role key 时返回 500", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pw-1" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.ok).toBe(false);
  });

  it("成功创建首个管理员", async () => {
    mockAdminClient({
      data: {
        user: {
          id: "user-1",
          email: "admin@example.com",
        },
      },
      error: null,
    });

    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pw-1", roles: ["editor"] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      data: {
        bootstrapped: true,
        account: {
          email: "admin@example.com",
          roles: ["editor"],
        },
      },
    });
  });

  it("重复创建用户返回 409", async () => {
    mockAdminClient({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });

    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pw-1" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });
});
