import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("prod smoke shortcuts v0", () => {
  it("keeps dashboard smoke-check quick links visible for operators", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx");

    expect(source).toContain("Smoke check shortcuts");
    expect(source).toContain("/api/daa/engine-health");
    expect(source).toContain("Dashboard 200");
  });
});
