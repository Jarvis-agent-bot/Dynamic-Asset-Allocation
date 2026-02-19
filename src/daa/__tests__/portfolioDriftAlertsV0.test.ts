import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("portfolio drift alerts v0", () => {
  it("keeps threshold-based drift action suggestions", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Live drift alerts");
    expect(source).toContain("Threshold-based action suggestions:");
    expect(source).toContain("Open preflight checklist");
    expect(source).toContain("Review target weights");
    expect(source).toContain("Tighten/relax threshold");
  });
});
