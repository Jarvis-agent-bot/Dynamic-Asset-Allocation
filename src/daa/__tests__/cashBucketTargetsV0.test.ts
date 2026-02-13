import { describe, expect, it } from "vitest";

import {
  deriveInvestablePct01V0,
  normalizeCashBucketTargetPct01V0,
  scaleTargetWeightsByInvestablePct01V0,
} from "../cashBucketTargetsV0";

describe("cash bucket targets v0", () => {
  it("normalizes cash target pct", () => {
    expect(normalizeCashBucketTargetPct01V0(null)).toBe(0);
    expect(normalizeCashBucketTargetPct01V0("NaN")).toBe(0);

    expect(normalizeCashBucketTargetPct01V0(-1)).toBe(0);
    expect(normalizeCashBucketTargetPct01V0(0)).toBe(0);

    expect(normalizeCashBucketTargetPct01V0(0.2)).toBeCloseTo(0.2);
    expect(normalizeCashBucketTargetPct01V0(20)).toBeCloseTo(0.2);

    // Clamp to avoid nearly-zero investable slice.
    expect(normalizeCashBucketTargetPct01V0(0.99)).toBeCloseTo(0.95);
    expect(normalizeCashBucketTargetPct01V0(99)).toBeCloseTo(0.95);
  });

  it("derives investable pct from money plan + manual cash target", () => {
    // No money plan -> manual cash bucket drives the investable slice.
    expect(deriveInvestablePct01V0({ moneyPlanInvestablePct01: null, targetCashPct01: 0.1 })).toBeCloseTo(0.9);

    // Money plan enforces a smaller investable slice (larger cash buffer).
    expect(deriveInvestablePct01V0({ moneyPlanInvestablePct01: 0.8, targetCashPct01: 0.1 })).toBeCloseTo(0.8);

    // Manual target increases cash (decreases investable) even if money plan is looser.
    expect(deriveInvestablePct01V0({ moneyPlanInvestablePct01: 0.95, targetCashPct01: 0.2 })).toBeCloseTo(0.8);
  });

  it("scales targetWeights by investable pct", () => {
    const w = [
      { id: "AAA", targetPct: 0.6 },
      { id: "BBB", targetPct: 0.4 },
    ];

    const scaled = scaleTargetWeightsByInvestablePct01V0(w, 0.8);
    expect(scaled.map((x) => Number(x.targetPct.toFixed(8)))).toEqual([0.48, 0.32]);

    // Investable=1 keeps weights unchanged.
    const unchanged = scaleTargetWeightsByInvestablePct01V0(w, 1);
    expect(unchanged).toBe(w);
  });
});
