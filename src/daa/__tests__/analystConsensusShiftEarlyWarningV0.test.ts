import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("feature-analyst-consensus-shift-early-warning-v0", () => {
  it("adds an analyst-consensus early-warning panel with concentration/risk cues", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx"),
      "utf8",
    );

    expect(source).toContain("Analyst-consensus shift early-warning");
    expect(source).toContain("Combine consensus and concentration cues to flag early regime-risk shifts.");
    expect(source).toContain("const earlyWarning = consensusDefense || concentrationRisk;");
    expect(source).toContain("consensus cue=<b style={{ color: consensusDefense ? 'var(--danger)' : '#16a34a' }}>{consensusDefense ? 'defense shift detected' : 'stable risk posture'}</b> · concentration cue=<b style={{ color: concentrationRisk ? 'var(--danger)' : '#16a34a' }}>{concentrationRisk ? 'hidden concentration risk' : 'diversity acceptable'}</b>");
  });
});
