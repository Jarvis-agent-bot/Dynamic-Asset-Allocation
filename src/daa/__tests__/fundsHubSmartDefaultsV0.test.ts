import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("funds hub smart defaults v0", () => {
  it("keeps smart defaults and inline hints wiring", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Funds hub smart defaults");
    expect(source).toContain("Apply smart defaults");
    expect(source).toContain("Apply operator-friendly defaults and see inline hints");
    expect(source).toContain("smartDefaultsHintsV0");
    expect(source).toContain("Open ready-to-run section");
  });
});
