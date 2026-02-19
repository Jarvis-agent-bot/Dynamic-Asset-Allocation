import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("run history compare view v0", () => {
  it("keeps compare controls and delta tables in dynamic rebalance history", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaDynamicRebalanceRunHistoryV0.tsx");

    expect(source).toContain("Compare two runs (v0)");
    expect(source).toContain("Pick a base run and a compare run to highlight metric and trade deltas.");
    expect(source).toContain("buildCompareMetrics");
    expect(source).toContain("buildOrderDeltaRows");
    expect(source).toContain("Trade deltas (compare - base)");
    expect(source).toContain("Select two different runs in the current view to compare.");
  });
});
