import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("mainline decision transparency targeted slice v0", () => {
  it("shows targeted-slice inputs, gates, and rationale in market/funds", () => {
    const file = resolve(process.cwd(), "app/daa/market/funds/_components/DaaRebalancePanel.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("Decision transparency · targeted slice");
    expect(source).toContain("inputs: current");
    expect(source).toContain("Price source:");
    expect(source).toContain("gates: Policy drift gate");
    expect(source).toContain("rationale:");
    expect(source).toContain("targetedDecisionTransparencyV0");
  });
});
