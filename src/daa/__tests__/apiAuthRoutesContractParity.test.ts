import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DAA_AUTH_SESSION_COOKIE_ } from "../auth/daaAuthConstants";
import { getDaaAuthContextFromRequest } from "../auth/daaAuthRequest";
import {
  authenticateDaaAuthAccount,
  bootstrapCreateFirstDaaAuthAccount,
  createDaaAuthSession,
  hasAnyDaaAuthAccounts,
  revokeDaaAuthSession,
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

function readRoute(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath);
  return readFileSync(abs, "utf8");
}

describe("/api/daa/auth regression pack (Postgres-backed contracts)", () => {
  it("keeps route-level status and cookie contracts explicit in auth handlers", () => {
    const bootstrapRoute = readRoute("app/api/daa/auth/bootstrap/route.ts");
    const loginRoute = readRoute("app/api/daa/auth/login/route.ts");
    const meRoute = readRoute("app/api/daa/auth/me/route.ts");
    const logoutRoute = readRoute("app/api/daa/auth/logout/route.ts");

    expect(bootstrapRoute).toContain('fail("INTERNAL_ERROR"');
    expect(bootstrapRoute).toContain('fail("UNAUTHORIZED", "unauthorized"');
    expect(bootstrapRoute).toContain('"www-authenticate": "DaaBootstrap"');
    expect(bootstrapRoute).toContain('ok({');

    expect(loginRoute).toContain('fail("UNAUTHORIZED", "invalid_credentials"');
    expect(loginRoute).toContain("ensureDevDefaultDaaAuthAccount");
    expect(loginRoute).toContain('fail("INTERNAL_ERROR", "auth_backend_unavailable"');
    expect(loginRoute).toContain('ok({');

    expect(meRoute).toContain("ensureDevDefaultDaaAuthAccount");
    expect(meRoute).toContain('fail("UNAUTHORIZED", "not_authenticated"');
    expect(meRoute).toContain('status: silent ? 200 : 401');
    expect(meRoute).toContain("name: DAA_AUTH_SESSION_COOKIE_");
    expect(meRoute).toContain('ok({');

    expect(logoutRoute).toContain('maxAge: 0');
    expect(logoutRoute).toContain('ok({ signedOut: true })');
  });

  it("keeps bootstrap -> login-context -> revoke flow stable on Postgres mem state", async () => {
    resetPgMem();

    expect(await hasAnyDaaAuthAccounts()).toBe(false);

    const account = await bootstrapCreateFirstDaaAuthAccount({
      username: "admin",
      password: "pw-1",
      roles: ["viewer"],
    });
    expect(account.roles).toContain("editor");
    expect(await hasAnyDaaAuthAccounts()).toBe(true);

    const auth = await authenticateDaaAuthAccount({ username: "admin", password: "pw-1" });
    expect(auth?.accountId).toBe(account.accountId);

    const { session, token } = await createDaaAuthSession({ accountId: account.accountId, userAgent: "vitest", ip: "127.0.0.1" });
    const req = new Request("https://example.com/api/daa/auth/me", {
      method: "GET",
      headers: { cookie: `${DAA_AUTH_SESSION_COOKIE_}=${encodeURIComponent(token)}` },
    });

    const beforeRevoke = await getDaaAuthContextFromRequest(req, { touch: false });
    expect(beforeRevoke?.account.accountId).toBe(account.accountId);

    const revoked = await revokeDaaAuthSession({ sessionId: session.sessionId });
    expect(revoked).toMatchObject({ ok: true });

    const afterRevoke = await getDaaAuthContextFromRequest(req, { touch: false });
    expect(afterRevoke).toBeNull();
  });
});
