import { describe, it, expect } from "vitest";

import { backtestSingleAsset, rankBacktestResults } from "../backtest";
import { buyAndHold, smaCrossover, ensembleStrategy } from "../strategies";

function makeFlatSeries({ n = 40, start = 100 }: { n?: number; start?: number } = {}) {
  const out: Array<{ date: string; close: number }> = [];
  for (let i = 0; i < n; i++) {
    out.push({ date: `2026-02-${String(i + 1).padStart(2, "0")}`, close: start });
  }
  return out;
}

describe("ensembleStrategy", () => {
  it("throws on empty series (signal quality contract)", () => {
    const s1 = buyAndHold();
    const s2 = smaCrossover({ fast: 3, slow: 10 });

    expect(() =>
      ensembleStrategy({
        strategies: [s1, s2],
        weightsById: { [s1.id]: 1, [s2.id]: 1 },
      }).weights([]),
    ).toThrow(/non-empty price series/i);
  });

  it("throws on negative weights (DAA contract)", () => {
    const series = makeFlatSeries({ n: 10 });
    const s1 = buyAndHold();
    const s2 = smaCrossover({ fast: 3, slow: 10 });

    expect(() =>
      ensembleStrategy({
        strategies: [s1, s2],
        weightsById: { [s1.id]: 1, [s2.id]: -0.01 },
      }).weights(series),
    ).toThrow(/non-negative/i);
  });

  it("throws when weightsById contains unknown strategy ids (signal quality contract)", () => {
    const series = makeFlatSeries({ n: 10 });
    const s1 = buyAndHold();
    const s2 = smaCrossover({ fast: 3, slow: 10 });

    expect(() =>
      ensembleStrategy({
        strategies: [s1, s2],
        weightsById: { [s1.id]: 1, [s2.id]: 1, unknown_strat: 0.1 },
      }).weights(series),
    ).toThrow(/Unknown strategy id\(s\) in weightsById/i);
  });

  it("throws when all included strategy weights are zero", () => {
    const series = makeFlatSeries({ n: 10 });
    const s1 = buyAndHold();
    const s2 = smaCrossover({ fast: 3, slow: 10 });

    expect(() =>
      ensembleStrategy({
        strategies: [s1, s2],
        weightsById: { [s1.id]: 0, [s2.id]: 0 },
      }).weights(series),
    ).toThrow(/positive weight/i);
  });

  it("throws when a strategy emits non-finite weights (signal quality contract)", () => {
    const series = makeFlatSeries({ n: 3 });

    const good = buyAndHold();
    const bad = {
      id: "bad",
      name: "Bad",
      weights: () => [0.2, Number.NaN, 0.2],
    };

    expect(() =>
      ensembleStrategy({
        strategies: [good, bad],
        weightsById: { [good.id]: 1, [bad.id]: 1 },
      }).weights(series),
    ).toThrow(/Non-finite weight/);
  });

  it("throws when a strategy emits out-of-range weights (signal quality contract)", () => {
    const series = makeFlatSeries({ n: 2 });

    const good = buyAndHold();
    const bad = {
      id: "bad2",
      name: "Bad2",
      weights: () => [0.2, 1.5],
    };

    expect(() =>
      ensembleStrategy({
        strategies: [good, bad],
        weightsById: { [good.id]: 1, [bad.id]: 1 },
      }).weights(series),
    ).toThrow(/Out-of-range weight/);
  });

  it("produces weights within [0,1] and correct length", () => {
    const series = makeFlatSeries({ n: 30 });
    const s1 = buyAndHold();
    const s2 = smaCrossover({ fast: 3, slow: 10 });

    const ensemble = ensembleStrategy({
      id: "ens",
      name: "ENS",
      strategies: [s1, s2],
      weightsById: { [s1.id]: 0.25, [s2.id]: 0.75 },
    });

    const w = ensemble.weights(series);
    expect(w).toHaveLength(series.length);
    expect(w.every((x: number) => x >= 0 && x <= 1 && Number.isFinite(x))).toBe(true);
  });
});

describe("rankBacktestResults", () => {
  it("adds a score and sorts descending", () => {
    const series = makeFlatSeries({ n: 25, start: 100 });
    const results = [backtestSingleAsset(buyAndHold(), series), backtestSingleAsset(smaCrossover({ fast: 3, slow: 10 }), series)];
    const ranked = rankBacktestResults(results);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toHaveProperty("score");
    expect(ranked[1]).toHaveProperty("score");
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it("is deterministic when scores tie (break ties by strategyId)", () => {
    const base = {
      equity: [1],
      dailyReturns: [],
      metrics: { totalReturn: 0, maxDrawdown: 0, sharpe: 0, winRate: 0 },
    };

    const ranked = rankBacktestResults(
      [
        { ...base, strategyId: "b", strategyName: "B" },
        { ...base, strategyId: "a", strategyName: "A" },
      ],
      { wReturn: 0, wSharpe: 0, wDrawdown: 0, wWinRate: 0 },
    );

    expect(ranked.map((r) => r.strategyId)).toEqual(["a", "b"]);
  });

  it("is deterministic even if score weights are non-finite (defensive)", () => {
    const base = {
      equity: [1],
      dailyReturns: [],
      metrics: { totalReturn: 0, maxDrawdown: 0, sharpe: 0, winRate: 0 },
    };

    const ranked = rankBacktestResults(
      [
        { ...base, strategyId: "b", strategyName: "B" },
        { ...base, strategyId: "a", strategyName: "A" },
      ],
      // would previously produce NaN scores (e.g. NaN * 0)
      { wReturn: Number.NaN, wSharpe: Number.NaN, wDrawdown: Number.NaN, wWinRate: Number.NaN },
    );

    expect(ranked.map((r) => r.strategyId)).toEqual(["a", "b"]);
  });
});

describe("signal confidence", () => {
  it("keeps HOLD confidence lower than decisive BUY/SELL", async () => {
    const mod = await import("../signalDecision");

    const thresholds = { buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };

    const hold = mod.computeConfidence("HOLD", 0.5, 0.51, thresholds);
    const buy = mod.computeConfidence("BUY", 0.55, 0.8, thresholds);
    const sell = mod.computeConfidence("SELL", 0.45, 0.1, thresholds);

    expect(hold).toBeLessThan(buy);
    expect(hold).toBeLessThan(sell);
  });
});
