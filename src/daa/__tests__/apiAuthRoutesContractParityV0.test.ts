import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "../auth/daaAuthConstantsV0";
import { getDaaAuthContextFromRequestV0 } from "../auth/daaAuthRequestV0";
import {
  authenticateDaaAuthAccountV0,
  bootstrapCreateFirstDaaAuthAccountV0,
  createDaaAuthSessionV0,
  hasAnyDaaAuthAccountsV0,
  revokeDaaAuthSessionV0,
} from "../auth/daaAuthStoreV0";

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

    expect(bootstrapRoute).toContain('status: 500');
    expect(bootstrapRoute).toContain('status: 401');
    expect(bootstrapRoute).toContain('error: "unauthorized"');
    expect(bootstrapRoute).toContain('"www-authenticate": "DaaBootstrap"');

    expect(loginRoute).toContain('error: "invalid_credentials"');
    expect(loginRoute).toContain("ensureDevDefaultDaaAuthAccountV0");

    expect(meRoute).toContain("ensureDevDefaultDaaAuthAccountV0");
    expect(meRoute).toContain('error = anyAccounts ? "not_authenticated" : "bootstrap_required"');
    expect(meRoute).toContain('status: 401');
    expect(meRoute).toContain("name: DAA_AUTH_SESSION_COOKIE_V0");

    expect(logoutRoute).toContain('maxAge: 0');
    expect(logoutRoute).toContain('NextResponse.json({ ok: true })');
  });

  it("keeps bootstrap -> login-context -> revoke flow stable on Postgres mem state", async () => {
    resetPgMem();

    expect(await hasAnyDaaAuthAccountsV0()).toBe(false);

    const account = await bootstrapCreateFirstDaaAuthAccountV0({
      username: "admin@example.com",
      password: "pw-1",
      roles: ["viewer"],
    });
    expect(account.roles).toContain("editor");
    expect(await hasAnyDaaAuthAccountsV0()).toBe(true);

    const auth = await authenticateDaaAuthAccountV0({ username: "admin@example.com", password: "pw-1" });
    expect(auth?.accountId).toBe(account.accountId);

    const { session, token } = await createDaaAuthSessionV0({ accountId: account.accountId, userAgent: "vitest", ip: "127.0.0.1" });
    const req = new Request("https://example.com/api/daa/auth/me", {
      method: "GET",
      headers: { cookie: `${DAA_AUTH_SESSION_COOKIE_V0}=${encodeURIComponent(token)}` },
    });

    const beforeRevoke = await getDaaAuthContextFromRequestV0(req, { touch: false });
    expect(beforeRevoke?.account.accountId).toBe(account.accountId);

    const revoked = await revokeDaaAuthSessionV0({ sessionId: session.sessionId });
    expect(revoked).toMatchObject({ ok: true });

    const afterRevoke = await getDaaAuthContextFromRequestV0(req, { touch: false });
    expect(afterRevoke).toBeNull();
  });
});
