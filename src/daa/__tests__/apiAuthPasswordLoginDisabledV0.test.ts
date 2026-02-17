import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRoute(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath);
  return readFileSync(abs, "utf8");
}

describe("/api/daa/auth/login route v0", () => {
  it("disables password login and returns explicit 410 contract", async () => {
    const loginRoute = readRoute("app/api/daa/auth/login/route.ts");
    expect(loginRoute).toContain('error: "password login disabled"');
    expect(loginRoute).toContain("status: 410");
  });
});
