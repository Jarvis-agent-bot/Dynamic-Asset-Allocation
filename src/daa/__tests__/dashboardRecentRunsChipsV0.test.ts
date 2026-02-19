import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("dashboard recent run chips v0", () => {
  it("keeps recent run quick chips in last sync card", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx");

    expect(source).toContain("Recent runs");
    expect(source).toContain("recentRuns");
    expect(source).toContain("/daa/dashboard?tab=dashboard#history-audit");
  });
});
