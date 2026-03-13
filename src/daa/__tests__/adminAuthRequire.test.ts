import { describe, expect, it } from "vitest";

import { requireDaaAdminViewerAuth } from "../adminAuth";
import { DAA_AUTH_SESSION_COOKIE_ } from "../auth/daaAuthConstants";
import {
  createDaaAuthAccount,
  createDaaAuthSession,
} from "../auth/daaAuthStore";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_PG_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMem() {
  // Use in-memory Postgres emulation for unit tests.
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

function makeCookieHeader(token: string): string {
  return `${DAA_AUTH_SESSION_COOKIE_}=${encodeURIComponent(token)}`;
}

describe("daa/adminAuth require* v0", () => {
  it("denies bearer-only auth without a session cookie", async () => {
    resetPgMem();

    const req = new Request("http://localhost/api/daa/admin/users", {
      headers: { authorization: "Bearer viewer-1" },
    });
    const denied = await requireDaaAdminViewerAuth(req);

    expect(denied).not.toBe(null);
    expect(denied!.status).toBe(401);
  });

  it("allows viewer role via cookie-backed session", async () => {
    resetPgMem();

    const account = await createDaaAuthAccount({
      username: "viewer@example.com",
      password: "pw-1",
      roles: ["viewer"],
    });
    const { token } = await createDaaAuthSession({
      accountId: account.accountId,
      ttlDays: 7,
      userAgent: "ua",
      ip: "1.2.3.4",
    });

    const req = new Request("http://localhost/api/daa/admin/users", {
      headers: { cookie: makeCookieHeader(token) },
    });

    expect(await requireDaaAdminViewerAuth(req)).toBe(null);
  });
});
