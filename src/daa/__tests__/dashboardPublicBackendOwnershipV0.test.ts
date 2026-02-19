import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("dashboard public backend ownership guard v0", () => {
  it("keeps Next.js-only /api/daa ownership visible in deploy checklist", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx");

    expect(source).toContain("Public /api/daa owned by Next.js");
    expect(source).toContain("DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES=0");
    expect(source).toContain("/api/daa/*");
  });
});
