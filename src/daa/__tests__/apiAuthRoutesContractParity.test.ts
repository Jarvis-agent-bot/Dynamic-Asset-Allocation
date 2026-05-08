import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRoute(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath);
  return readFileSync(abs, "utf8");
}

describe("/api/daa/auth regression pack (local Postgres-backed contracts)", () => {
  it("keeps route-level contracts explicit in auth handlers", () => {
    const bootstrapRoute = readRoute("app/api/daa/auth/bootstrap/route.ts");
    const loginRoute = readRoute("app/api/daa/auth/login/route.ts");
    const meRoute = readRoute("app/api/daa/auth/me/route.ts");
    const logoutRoute = readRoute("app/api/daa/auth/logout/route.ts");
    const accountsRoute = readRoute("app/api/daa/auth/accounts/route.ts");
    const accountRoute = readRoute("app/api/daa/auth/accounts/[accountId]/route.ts");

    // Bootstrap creates the first local admin account.
    expect(bootstrapRoute).toContain('fail("VALIDATION_FAILED"');
    expect(bootstrapRoute).toContain("bootstrapCreateFirstDaaAuthAccount");
    expect(bootstrapRoute).toContain("ok({");

    // Login authenticates against local auth store and sets an HttpOnly cookie.
    expect(loginRoute).toContain('fail("UNAUTHORIZED", "invalid_credentials"');
    expect(loginRoute).toContain("authenticateDaaAuthAccount");
    expect(loginRoute).toContain("setDaaAuthSessionCookie");
    expect(loginRoute).toContain('fail("INTERNAL_ERROR", "auth_backend_unavailable"');
    expect(loginRoute).toContain("ok({");

    // Me uses the local cookie-backed auth context.
    expect(meRoute).toContain('fail("UNAUTHORIZED", "not_authenticated"');
    expect(meRoute).toContain("status: silent ? 200 : 401");
    expect(meRoute).toContain("getDaaAuthContextFromRequest");
    expect(meRoute).toContain("ok({");

    // Logout revokes the local session and clears the cookie.
    expect(logoutRoute).toContain("revokeDaaAuthSession");
    expect(logoutRoute).toContain("clearDaaAuthSessionCookie");
    expect(logoutRoute).toContain("ok({ signedOut: true })");

    // Account management is local Postgres-backed and editor-only.
    expect(accountsRoute).toContain("requireDaaAdminEditorAuth");
    expect(accountsRoute).toContain("listDaaAuthAccounts");
    expect(accountsRoute).toContain("createDaaAuthAccount");
    expect(accountRoute).toContain("updateDaaAuthAccount");
    expect(accountRoute).toContain("resetDaaAuthAccountPassword");
    expect(accountRoute).toContain("deleteDaaAuthAccount");
  });
});
