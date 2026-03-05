import { describe, it, expect } from "vitest";

import { assertNonNegativeWeights, DEFAULT_ENSEMBLE_WEIGHTS, normalizeWeights } from "../config";

describe("assertNonNegativeWeights", () => {
  it("throws on negative weights", () => {
    expect(() => assertNonNegativeWeights({ a: -1, b: 3 })).toThrow(/non-negative/);
  });

  it("accepts zeros and positives", () => {
    expect(() => assertNonNegativeWeights({ a: 0, b: 1 })).not.toThrow();
  });
});

describe("normalizeWeights", () => {
  it("normalizes to sum=1", () => {
    const n = normalizeWeights({ a: 2, b: 2 });
    expect(n.a).toBeCloseTo(0.5);
    expect(n.b).toBeCloseTo(0.5);
    expect(n.a + n.b).toBeCloseTo(1);
  });

  it("throws on negative values", () => {
    expect(() => normalizeWeights({ a: -1, b: 3 })).toThrow(/non-negative/);
  });

  it("throws on non-finite values", () => {
    expect(() => normalizeWeights({ a: Number.POSITIVE_INFINITY, b: 1 })).toThrow(/finite number/);
    expect(() => normalizeWeights({ a: NaN as unknown as number, b: 1 })).toThrow(/finite number/);
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
