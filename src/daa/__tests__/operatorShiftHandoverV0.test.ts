import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("operator shift handover v0", () => {
  it("keeps operator handover summary block for next shift continuity", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Operator shift handover");
    expect(source).toContain("Summary for next shift continuity.");
    expect(source).toContain("next shift focus:");
    expect(source).toContain("Open history/audit");
    expect(source).toContain("Open preflight checklist");
  });
});
