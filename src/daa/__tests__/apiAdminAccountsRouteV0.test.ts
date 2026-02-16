import { describe, expect, it } from "vitest";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "../auth/daaAuthConstantsV0";
import {
  createDaaAuthAccountV0,
  createDaaAuthSessionV0,
} from "../auth/daaAuthStoreV0";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";

function resetPgMem() {
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

function makeCookieHeader(token: string): string {
  return `${DAA_AUTH_SESSION_COOKIE_V0}=${encodeURIComponent(token)}`;
}

describe("/api/daa/admin/accounts route v0", () => {
  it("denies unauthenticated GET", async () => {
    resetPgMem();

    const mod = await import("../../../app/api/daa/admin/accounts/route");
    const req = new Request("https://example.com/api/daa/admin/accounts", { method: "GET" });

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(401);
  });

  it("allows GET for editor session", async () => {
    resetPgMem();

    const admin = await createDaaAuthAccountV0({ username: "admin@example.com", password: "pw-1", roles: ["editor"] });
    const { token } = await createDaaAuthSessionV0({ accountId: admin.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });

    const mod = await import("../../../app/api/daa/admin/accounts/route");
    const req = new Request("https://example.com/api/daa/admin/accounts", {
      method: "GET",
      headers: {
        cookie: makeCookieHeader(token),
        accept: "application/json",
      },
    });

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(200);

    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(Array.isArray(j.accounts)).toBe(true);
  });
});
