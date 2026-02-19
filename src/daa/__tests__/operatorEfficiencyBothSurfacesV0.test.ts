import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("operator efficiency on dashboard + funds surfaces v0", () => {
  it("keeps cross-surface quick actions for market/funds and history", () => {
    const dashboard = readRepoFile("app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx");
    const funds = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(dashboard).toContain("Open Market/Funds");
    expect(funds).toContain("Open dashboard history");
    expect(funds).toContain("/daa/dashboard?tab=dashboard#history-audit");
  });
});
