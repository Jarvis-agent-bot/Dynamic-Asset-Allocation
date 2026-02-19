import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("inline detection review workspace v0", () => {
  it("keeps inline approve/reject review actions for detected issues", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Inline detection review workspace");
    expect(source).toContain("Quick approve/reject for detected issues before rerun.");
    expect(source).toContain("Approve");
    expect(source).toContain("Reject");
    expect(source).toContain("detectionReviewStateV0");
  });
});
