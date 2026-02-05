import { describe, it, expect } from "vitest";

import { DEFAULT_ENSEMBLE_WEIGHTS, normalizeWeights } from "../config.js";

describe("normalizeWeights", () => {
  it("normalizes to sum=1", () => {
    const n = normalizeWeights({ a: 2, b: 2 });
    expect(n.a).toBeCloseTo(0.5);
    expect(n.b).toBeCloseTo(0.5);
    expect(n.a + n.b).toBeCloseTo(1);
  });

  it("clamps negatives to 0", () => {
    const n = normalizeWeights({ a: -1, b: 3 });
    expect(n.a).toBe(0);
    expect(n.b).toBe(1);
  });

  it("keeps shape of default config", () => {
    const n = normalizeWeights(DEFAULT_ENSEMBLE_WEIGHTS);
    const keys = Object.keys(DEFAULT_ENSEMBLE_WEIGHTS);
    expect(Object.keys(n).sort()).toEqual(keys.sort());
    const sum = Object.values(n).reduce((a, b) => a + b, 0);
    // if defaults are non-zero, sum should be 1
    expect(sum).toBeCloseTo(1);
  });
});
