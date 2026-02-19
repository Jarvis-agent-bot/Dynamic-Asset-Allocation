import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("dashboard ops alert center v0", () => {
  it("keeps grouped warning center with suggested next actions", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx");

    expect(source).toContain("Ops alert center");
    expect(source).toContain("opsAlertGroupsV0");
    expect(source).toContain("No active alerts. System looks healthy for operator flow.");
    expect(source).toContain("Latest run failed");
    expect(source).toContain("Missing required deploy env");
  });
});
