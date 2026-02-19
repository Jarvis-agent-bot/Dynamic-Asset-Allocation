import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("dashboard guided empty state v0", () => {
  it("keeps first-run progressive CTA path in overview cards", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx");

    expect(source).toContain("Guided first run");
    expect(source).toContain("No runs yet. Start from Wizard, then run Market/Funds, then review History/Audit.");
    expect(source).toContain("1) Open Wizard");
    expect(source).toContain("2) Run Market/Funds");
    expect(source).toContain("3) Review History/Audit");
  });
});
