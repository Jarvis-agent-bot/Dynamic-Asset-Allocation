import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calibrateQatFeedbackLoopV0 } from "../qatFeedbackCalibrationLoopV0";

describe("feature-qat-feedback-calibration-loop-v0", () => {
  it("applies feedback signal to produce operator-visible before/after W_qat impact", () => {
    const result = calibrateQatFeedbackLoopV0(
      [
        { id: "AAA", targetPct: 0.2, wQatPct: 0.14 },
        { id: "BBB", targetPct: 0.3, wQatPct: 0.33 },
      ],
      1,
    );

    expect(result[0].afterWQatPct).toBeGreaterThan(result[0].beforeWQatPct);
    expect(result[0].impactPct).toBeGreaterThan(0);
    expect(result[1].afterWQatPct).toBeLessThan(result[1].beforeWQatPct);
    expect(result[1].impactPct).toBeLessThan(0);
  });

  it("renders the calibration loop card with before/after weight impact", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx"),
      "utf8",
    );

    expect(source).toContain("W_qat feedback calibration loop");
    expect(source).toContain("Operator-facing before/after W_qat impact from closed-loop feedback calibration.");
    expect(source).toContain("const calibratedRows = calibrateQatFeedbackLoopV0(qatRows, feedbackSignal);");
    expect(source).toContain("before={(r.beforeWQatPct * 100).toFixed(2)}% {'->'} after=<b>{(r.afterWQatPct * 100).toFixed(2)}%</b>");
  });
});
