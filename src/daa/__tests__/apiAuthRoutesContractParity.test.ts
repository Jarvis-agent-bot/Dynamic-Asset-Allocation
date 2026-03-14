import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRoute(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath);
  return readFileSync(abs, "utf8");
}

describe("/api/daa/auth regression pack (Supabase-backed contracts)", () => {
  it("keeps route-level contracts explicit in auth handlers", () => {
    const bootstrapRoute = readRoute("app/api/daa/auth/bootstrap/route.ts");
    const loginRoute = readRoute("app/api/daa/auth/login/route.ts");
    const meRoute = readRoute("app/api/daa/auth/me/route.ts");
    const logoutRoute = readRoute("app/api/daa/auth/logout/route.ts");

    // Bootstrap uses Supabase admin API
    expect(bootstrapRoute).toContain('fail("VALIDATION_FAILED"');
    expect(bootstrapRoute).toContain('fail("INTERNAL_ERROR"');
    expect(bootstrapRoute).toContain("createClient");
    expect(bootstrapRoute).toContain("ok({");

    // Login uses Supabase signInWithPassword
    expect(loginRoute).toContain('fail("UNAUTHORIZED", "invalid_credentials"');
    expect(loginRoute).toContain("signInWithPassword");
    expect(loginRoute).toContain('fail("INTERNAL_ERROR", "auth_backend_unavailable"');
    expect(loginRoute).toContain("ok({");

    // Me uses Supabase getUser
    expect(meRoute).toContain('fail("UNAUTHORIZED", "not_authenticated"');
    expect(meRoute).toContain("status: silent ? 200 : 401");
    expect(meRoute).toContain("getUser");
    expect(meRoute).toContain("ok({");

    // Logout uses Supabase signOut
    expect(logoutRoute).toContain("signOut");
    expect(logoutRoute).toContain("ok({ signedOut: true })");
  });
});
