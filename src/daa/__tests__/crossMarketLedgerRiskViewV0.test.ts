import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("cross-market ledger risk view v0", () => {
  it("keeps A/H/US unified base-ccy exposure risk view", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanelMaintainabilityCardsV0.tsx");

    expect(source).toContain("Cross-market ledger risk view");
    expect(source).toContain("Unified base-ccy exposure for A/H/US books.");
    expect(source).toContain("Source snapshot: holdings/weights from current rebalance table rows (n={rows.length}); valuation base={baseCcy || 'portfolio base ccy'}.");
    expect(source).toContain("exposure≈<b>");
    expect(source).toContain("(['A', 'H', 'US', 'Other'] as const)");
    expect(source).toContain("max|drift|≈<b>");
  });
});
