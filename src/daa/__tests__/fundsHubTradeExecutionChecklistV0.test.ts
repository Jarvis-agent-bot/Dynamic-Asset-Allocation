import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("funds hub trade execution checklist v0", () => {
  it("keeps blocker-aware next action guidance in preflight panel", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalanceOpsOverviewCardsV0.tsx");

    expect(source).toContain("Next action: Set target weights");
    expect(source).toContain("Next action: Resolve price warnings");
    expect(source).toContain("Next action: Resolve cash blocker");
    expect(source).toContain("Next action: Resolve checklist blockers");
    expect(source).toContain("Next action: Review warnings then run preflight");
  });
});
