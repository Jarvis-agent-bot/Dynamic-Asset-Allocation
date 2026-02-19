import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("funds hub scenario presets v0", () => {
  it("keeps save/load preset controls wired in market/funds auto plan panel", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("LS_AUTO_PLAN_SCENARIO_PRESETS_V0");
    expect(source).toContain("saveAutoPlanScenarioPresetV0");
    expect(source).toContain("loadAutoPlanScenarioPresetV0");
    expect(source).toContain("deleteAutoPlanScenarioPresetV0");
    expect(source).toContain("Preset name");
    expect(source).toContain("Save preset");
    expect(source).toContain("Saved presets");
    expect(source).toContain("Load preset");
  });
});
