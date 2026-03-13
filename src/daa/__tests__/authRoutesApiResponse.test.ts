import { beforeEach, describe, expect, it } from "vitest";

import { POST as bootstrapPost } from "@/app/api/daa/auth/bootstrap/route";
import { POST as loginPost } from "@/app/api/daa/auth/login/route";
import { POST as logoutPost } from "@/app/api/daa/auth/logout/route";
import { GET as meGet } from "@/app/api/daa/auth/me/route";

import { DAA_AUTH_SESSION_COOKIE_ } from "../auth/daaAuthConstants";
import {
  bootstrapCreateFirstDaaAuthAccount,
  createDaaAuthSession,
} from "../auth/daaAuthStore";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_PG_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMem() {
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

beforeEach(() => {
  resetPgMem();
  delete process.env.DAA_AUTH_BOOTSTRAP_TOKEN;
});

describe("auth-routes-api-response-v1", () => {
  it("bootstrap 首个账号时返回 ApiResponse 成功结构", async () => {
    process.env.DAA_AUTH_BOOTSTRAP_TOKEN = "boot-1";

    const response = await bootstrapPost(new Request("http://localhost/api/daa/auth/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-daa-bootstrap-token": "boot-1",
      },
      body: JSON.stringify({
        username: "admin",
        password: "pw-1",
        roles: ["viewer"],
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      data: {
        bootstrapped: true,
        account: {
          username: "admin",
        },
      },
    });
    expect(json.data.account.roles).toContain("editor");
  });

  it("login 返回 ApiResponse 成功结构并下发会话 cookie", async () => {
    await bootstrapCreateFirstDaaAuthAccount({
      username: "admin",
      password: "pw-1",
      roles: ["viewer"],
    });

    const response = await loginPost(new Request("http://localhost/api/daa/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "pw-1",
        returnTo: "/daa/dashboard",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      data: {
        account: {
          username: "admin",
        },
      },
    });
    expect(json.data.redirectTo).toContain("notice=signed_in");
    expect(response.headers.get("set-cookie")).toContain(DAA_AUTH_SESSION_COOKIE_);
  });


  it("login 会保留 dashboard 深链 returnTo", async () => {
    await bootstrapCreateFirstDaaAuthAccount({
      username: "admin",
      password: "pw-1",
      roles: ["viewer"],
    });

    const response = await loginPost(new Request("http://localhost/api/daa/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "pw-1",
        returnTo: "/daa/dashboard/workbench?from=login",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      data: {
        redirectTo: "/daa/dashboard/workbench?from=login&notice=signed_in",
      },
    });
  });

  it("me silent 未登录时返回 ApiResponse 错误结构并清理 cookie", async () => {
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
    expect(response.headers.get("set-cookie")).toContain(`${DAA_AUTH_SESSION_COOKIE_}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("logout 返回 ApiResponse 成功结构并清理 cookie", async () => {
    const account = await bootstrapCreateFirstDaaAuthAccount({
      username: "admin",
      password: "pw-1",
      roles: ["viewer"],
    });
    const { token } = await createDaaAuthSession({
      accountId: account.accountId,
      userAgent: "vitest",
      ip: "127.0.0.1",
    });

    const response = await logoutPost(new Request("http://localhost/api/daa/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${DAA_AUTH_SESSION_COOKIE_}=${encodeURIComponent(token)}`,
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      data: {
        signedOut: true,
      },
    });
    expect(response.headers.get("set-cookie")).toContain(`${DAA_AUTH_SESSION_COOKIE_}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
