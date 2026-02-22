import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runFxStressSimulatorV0 } from "../fxStressSimulatorV0";

describe("feature-cross-market-fx-stress-simulator-v0", () => {
  it("computes A/H/US stressed exposure sensitivity", () => {
    const result = runFxStressSimulatorV0(
      [
        { book: "A", exposure: 1000 },
        { book: "H", exposure: 500 },
        { book: "US", exposure: 800 },
      ],
      { cnyShockPct: -0.02, hkdShockPct: -0.01, usdShockPct: 0.015 },
    );

    expect(result[0].stressedExposure).toBeCloseTo(980, 6);
    expect(result[1].stressedExposure).toBeCloseTo(495, 6);
    expect(result[2].stressedExposure).toBeCloseTo(812, 6);
  });

  it("renders operator-facing cross-market FX stress card", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/daa/market/funds/_components/DaaRebalancePanelMaintainabilityCardsV0.tsx"),
      "utf8",
    );

    expect(source).toContain("Cross-market FX stress simulator");
    expect(source).toContain("A/H/US exposure sensitivity under a shared FX shock scenario.");
    expect(source).toContain("const fxStress = runFxStressSimulatorV0(");
  });
});
