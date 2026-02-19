import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("rebalance what-if lab v0", () => {
  it("keeps side-by-side what-if lab scenario compare block", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("What-if lab (side-by-side scenarios)");
    expect(source).toContain("Compare baseline vs stress assumptions before confirm.");
    expect(source).toContain("Scenario A · baseline");
    expect(source).toContain("Scenario B · stress");
    expect(source).toContain("cost≈");
  });
});
