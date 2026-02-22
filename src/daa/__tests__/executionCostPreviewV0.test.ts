import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("execution cost preview v0", () => {
  it("keeps execution cost preview with fee/slippage ranges", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalanceWhatIfSectionV0.tsx");

    expect(source).toContain("Execution cost preview");
    expect(source).toContain("Estimated fee range≈");
    expect(source).toContain("slippage range≈");
    expect(source).toContain("total execution cost≈");
  });
});
