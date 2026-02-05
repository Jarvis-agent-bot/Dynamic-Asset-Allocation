import { describe, it, expect } from "vitest";

import { ensembleTargetWeights } from "../ensemble/targetWeights";
import type { PriceBar, Strategy } from "../domain";

function bar(date: string, close = 100): PriceBar {
  return { date, close };
}

function strat(id: string, ws: number[], name?: string): Strategy {
  return {
    id,
    name: name ?? id,
    weights: () => ws,
  };
}

describe("ensembleTargetWeights contracts", () => {
  it("throws when strategy ids are not unique (prevents silent overwrites)", () => {
    const series = [bar("2026-02-01"), bar("2026-02-02")];

    const strategies = [
      strat("dup", [0.2, 0.2], "A"),
      strat("dup", [0.8, 0.8], "B"),
    ];

    expect(() => ensembleTargetWeights(strategies, series, { dup: 1 })).toThrow(/ids must be unique/i);
  });

  it("throws when weightsConfig includes unknown non-zero strategy ids", () => {
    const series = [bar("2026-02-01"), bar("2026-02-02")];

    const strategies = [strat("s1", [0.2, 0.2])];

    expect(() =>
      ensembleTargetWeights(strategies, series, {
        s1: 1,
        unknown: 0.1,
      })
    ).toThrow(/unknown strategy id/i);
  });

  it("throws when series dates are not strictly increasing", () => {
    const series = [bar("2026-02-02"), bar("2026-02-01")];

    const strategies = [strat("s1", [0.2, 0.2])];

    expect(() => ensembleTargetWeights(strategies, series, { s1: 1 })).toThrow(/strictly increasing/i);
  });

  it("throws when a strategy emits out-of-range weights", () => {
    const series = [bar("2026-02-01"), bar("2026-02-02")];

    const strategies = [strat("s1", [0.2, 1.2])];

    expect(() => ensembleTargetWeights(strategies, series, { s1: 1 })).toThrow(/out-of-range/i);
  });
});
