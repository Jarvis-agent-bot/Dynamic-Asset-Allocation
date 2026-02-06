import { describe, it, expect } from "vitest";

import { computeMetrics, scoreMetrics } from "../metrics";

describe("computeMetrics", () => {
  it("throws when equity and dailyReturns lengths mismatch (contract)", () => {
    expect(() => computeMetrics([1, 1.1], [0.1])).toThrow(/equity\.length.*dailyReturns\.length/i);
  });

  it("computes simple metrics for a flat equity curve", () => {
    const equity = [1, 1, 1];
    const dailyReturns = [0, 0, 0];

    const m = computeMetrics(equity, dailyReturns);

    expect(m.totalReturn).toBe(0);
    expect(m.maxDrawdown).toBe(0);
    expect(m.sharpe).toBe(0);
    expect(m.winRate).toBe(0);
  });
});

describe("scoreMetrics", () => {
  it("is deterministic and finite for typical inputs", () => {
    const score = scoreMetrics({ totalReturn: 0.2, maxDrawdown: 0.1, sharpe: 1.0, winRate: 0.55 });
    expect(Number.isFinite(score)).toBe(true);
  });
});
