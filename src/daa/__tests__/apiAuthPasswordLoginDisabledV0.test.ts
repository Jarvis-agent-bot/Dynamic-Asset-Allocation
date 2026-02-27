import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRoute(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath);
  return readFileSync(abs, "utf8");
}

describe("/api/daa/auth/login route v0", () => {
  it("enables username/password login and no longer returns the disabled contract", async () => {
    const loginRoute = readRoute("app/api/daa/auth/login/route.ts");
    expect(loginRoute).toContain("authenticateDaaAuthAccountV0");
    expect(loginRoute).toContain('error: "invalid_credentials"');
    expect(loginRoute).toContain("ensureDevDefaultDaaAuthAccountV0");
    expect(loginRoute).not.toContain('error: "password login disabled"');
    expect(loginRoute).not.toContain("status: 410");
  });
});
