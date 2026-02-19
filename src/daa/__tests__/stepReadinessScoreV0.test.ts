import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("step readiness score v0", () => {
  it("keeps step readiness scorecard with blocker checks", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Step readiness scorecard");
    expect(source).toContain("Shows blockers before execution.");
    expect(source).toContain("readiness score:");
    expect(source).toContain("Target weights configured");
    expect(source).toContain("No checklist blockers");
  });
});
