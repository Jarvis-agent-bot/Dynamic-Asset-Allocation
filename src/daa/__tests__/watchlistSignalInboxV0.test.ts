import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("watchlist signal inbox v0", () => {
  it("keeps urgency/symbol grouped watchlist signal inbox", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Watchlist signal inbox");
    expect(source).toContain("Grouped market signals by urgency and symbol.");
    expect(source).toContain("Urgent");
    expect(source).toContain("Review price inputs");
    expect(source).toContain("Review symbol targets");
  });
});
