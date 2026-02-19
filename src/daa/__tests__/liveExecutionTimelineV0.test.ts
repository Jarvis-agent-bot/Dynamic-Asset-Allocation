import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("live execution timeline v0", () => {
  it("keeps timeline stream wiring in funds hub", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Live execution timeline");
    expect(source).toContain("pushLiveTimelineV0");
    expect(source).toContain("Paper run started.");
    expect(source).toContain("Step2 refresh + Step4 recommendation started.");
  });
});
