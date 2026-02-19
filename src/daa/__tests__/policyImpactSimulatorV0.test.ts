import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("policy impact simulator v0", () => {
  it("keeps policy impact simulator preview before confirm", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Policy impact simulator");
    expect(source).toContain("Preview allocation + risk posture before confirm");
    expect(source).toContain("drift over=");
    expect(source).toContain("risk=<b");
    expect(source).toContain("fee/slippage=");
  });
});
