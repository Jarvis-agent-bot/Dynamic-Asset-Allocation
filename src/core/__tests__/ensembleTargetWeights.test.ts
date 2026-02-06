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

  it("allows weightsConfig to include unknown ids with 0 weight (disabled strategies)", () => {
    const series = [bar("2026-02-01"), bar("2026-02-02")];

    const strategies = [strat("s1", [0.2, 0.2])];

    expect(() =>
      ensembleTargetWeights(strategies, series, {
        s1: 1,
        unused: 0,
      })
    ).not.toThrow();
  });

  it("throws when weightsConfig assigns no positive weight to included strategies", () => {
    const series = [bar("2026-02-01"), bar("2026-02-02")];

    const strategies = [strat("s1", [0.2, 0.2])];

    expect(() => ensembleTargetWeights(strategies, series, { s1: 0 })).toThrow(/positive weight/i);
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

  it("sorts explainability reasons by contribution magnitude (improves readability)", () => {
    const series = [bar("2026-02-01"), bar("2026-02-02")];

    const strategies = [
      strat("s1", [0.0, 1.0], "Strat 1"),
      strat("s2", [1.0, 0.0], "Strat 2"),
    ];

    const { reasonsByDay } = ensembleTargetWeights(strategies, series, {
      s1: 0.25,
      s2: 0.75,
    });

    // Day 1: s2 contributes 0.75*1.0, s1 contributes 0.25*0.0 => s2 first.
    expect(reasonsByDay[0][0]).toMatch(/^Strat 2:/);
    // Day 2: s1 contributes 0.25*1.0, s2 contributes 0.75*0.0 => s1 first.
    expect(reasonsByDay[1][0]).toMatch(/^Strat 1:/);
  });

  it("uses a deterministic tie-breaker for equal contributions (prevents jitter)", () => {
    const series = [bar("2026-02-01")];

    const strategies = [
      strat("b", [0.5], "B"),
      strat("a", [0.5], "A"),
    ];

    const { reasonsByDay } = ensembleTargetWeights(strategies, series, {
      a: 1,
      b: 1,
    });

    // Equal contrib => sorted by id (a then b).
    expect(reasonsByDay[0][0]).toMatch(/^A:/);
    expect(reasonsByDay[0][1]).toMatch(/^B:/);
  });

  it("throws when a strategy emits non-finite weights (guards signal quality)", () => {
    const series = [bar("2026-02-01"), bar("2026-02-02")];

    const strategies = [strat("s1", [0.2, Number.NaN])];

    expect(() => ensembleTargetWeights(strategies, series, { s1: 1 })).toThrow(/non-finite/i);
  });

  it("throws when a strategy weights length does not match the series", () => {
    const series = [bar("2026-02-01"), bar("2026-02-02")];

    const strategies = [strat("s1", [0.2])];

    expect(() => ensembleTargetWeights(strategies, series, { s1: 1 })).toThrow(/length mismatch/i);
  });
});
