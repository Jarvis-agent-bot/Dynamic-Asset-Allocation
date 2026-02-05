import { describe, it, expect } from "vitest";

import { ensembleTargetWeights } from "../ensemble/targetWeights";
import type { PriceBar, Strategy } from "../domain";

function makeSeries(): PriceBar[] {
  return [
    { date: "2026-02-01", close: 100 },
    { date: "2026-02-02", close: 101 },
  ];
}

function strat(id: string, w: number): Strategy {
  return {
    id,
    name: id,
    weights: (series) => series.map(() => w),
  };
}

describe("ensembleTargetWeights (weightsConfig contract)", () => {
  it("throws on unknown strategy ids with non-zero weights (prevents silent dilution)", () => {
    const strategies = [strat("a", 1), strat("b", 0)];
    const series = makeSeries();

    expect(() =>
      ensembleTargetWeights(strategies, series, {
        a: 1,
        b: 1,
        unknown: 1,
      })
    ).toThrow(/Unknown strategy id\(s\) in weightsConfig/);
  });

  it("ignores unknown strategy ids when their weight is explicitly 0", () => {
    const strategies = [strat("a", 1), strat("b", 0)];
    const series = makeSeries();

    const { targetWeights } = ensembleTargetWeights(strategies, series, {
      a: 1,
      b: 1,
      unknown: 0,
    });

    // If a and b are equally weighted, target weight is average of (1 and 0) => 0.5.
    expect(targetWeights).toEqual([0.5, 0.5]);
  });

  it("throws when all included strategy weights are 0 (prevents silent always-0 target)", () => {
    const strategies = [strat("a", 1), strat("b", 0)];
    const series = makeSeries();

    expect(() =>
      ensembleTargetWeights(strategies, series, {
        a: 0,
        b: 0,
      })
    ).toThrow(/must assign a positive weight/);
  });
});
