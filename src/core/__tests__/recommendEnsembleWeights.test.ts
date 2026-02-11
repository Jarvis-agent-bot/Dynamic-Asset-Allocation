import { describe, it, expect } from "vitest";

import { recommendEnsembleWeightsFromRankedResults } from "../recommendEnsembleWeights";

function r(id: string, score: number) {
  return {
    strategyId: id,
    strategyName: id,
    equity: [1],
    dailyReturns: [0],
    metrics: { totalReturn: 0, maxDrawdown: 0, sharpe: 0, winRate: 0 },
    score,
  } as any;
}

describe("recommendEnsembleWeightsFromRankedResults", () => {
  it("returns {} for empty input", () => {
    expect(recommendEnsembleWeightsFromRankedResults([])).toEqual({});
  });

  it("throws when strategy ids are not unique", () => {
    expect(() => recommendEnsembleWeightsFromRankedResults([r("s1", 1), r("s1", 2)])).toThrow(/unique/i);
  });

  it("shifts negative scores to keep weights non-negative", () => {
    const w = recommendEnsembleWeightsFromRankedResults([r("a", -2), r("b", 1)]);
    expect(w.a).toBeGreaterThanOrEqual(0);
    expect(w.b).toBeGreaterThanOrEqual(0);
    // after shift by 2 => a=0, b=3
    expect(w).toEqual({ a: 0, b: 3 });
  });

  it("falls back to equal weights when all scores map to 0", () => {
    const w = recommendEnsembleWeightsFromRankedResults([r("a", 0), r("b", 0), r("c", 0)]);
    expect(w).toEqual({ a: 1, b: 1, c: 1 });
  });
});
