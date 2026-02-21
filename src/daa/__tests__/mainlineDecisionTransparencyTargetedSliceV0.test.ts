import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("mainline decision transparency targeted slice v0", () => {
  it("shows targeted-slice inputs, gates, and rationale in market/funds", () => {
    const panelFile = resolve(process.cwd(), "app/daa/market/funds/_components/DaaRebalancePanel.tsx");
    const cardFile = resolve(process.cwd(), "app/daa/market/funds/_components/DaaTargetedDecisionTransparencyCardV0.tsx");

    const panelSource = readFileSync(panelFile, "utf8");
    const cardSource = readFileSync(cardFile, "utf8");

    expect(panelSource).toContain("DaaTargetedDecisionTransparencyCardV0");
    expect(panelSource).toContain("targetedDecisionTransparencyV0");
    expect(panelSource).not.toContain("suggestedOrdersV0");

    expect(cardSource).toContain("Decision transparency · targeted slice");
    expect(cardSource).toContain("inputs: current");
    expect(cardSource).toContain("Price source:");
    expect(cardSource).toContain("gates: Policy drift gate");
    expect(cardSource).toContain("rationale:");
  });
});
