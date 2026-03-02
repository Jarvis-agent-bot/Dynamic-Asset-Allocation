import { describe, expect, it } from "vitest";

import {
  buildTargetWeightDiffRowsV1,
  prepareAlignedSeriesBySymbolV1,
  runStrategyLabBacktestsV1,
} from "../strategyLabEngineV1";

describe("strategyLabEngineV1", () => {
  it("aligns multi-symbol series by common dates", () => {
    const aligned = prepareAlignedSeriesBySymbolV1({
      AAA: [
        { date: "2026-01-01", close: 100 },
        { date: "2026-01-02", close: 102 },
        { date: "2026-01-03", close: 103 },
      ],
      BBB: [
        { date: "2026-01-01", close: 50 },
        { date: "2026-01-03", close: 55 },
        { date: "2026-01-04", close: 56 },
      ],
    });

    expect(Object.keys(aligned)).toEqual(["AAA", "BBB"]);
    expect(aligned.AAA.map((x) => x.date)).toEqual(["2026-01-01", "2026-01-03"]);
    expect(aligned.BBB.map((x) => x.date)).toEqual(["2026-01-01", "2026-01-03"]);
  });

  it("supports union + forward-fill alignment mode", () => {
    const aligned = prepareAlignedSeriesBySymbolV1(
      {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 102 },
          { date: "2026-01-03", close: 103 },
          { date: "2026-01-04", close: 104 },
        ],
        BBB: [
          { date: "2026-01-01", close: 50 },
          { date: "2026-01-03", close: 55 },
          { date: "2026-01-04", close: 56 },
        ],
      },
      { mode: "ffill_union" },
    );

    expect(Object.keys(aligned)).toEqual(["AAA", "BBB"]);
    expect(aligned.AAA.map((x) => x.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
    expect(aligned.BBB.map((x) => x.close)).toEqual([50, 50, 55, 56]);
  });

  it("runs real backtest candidates with baseline + ensemble", () => {
    const result = runStrategyLabBacktestsV1({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 102 },
          { date: "2026-01-03", close: 104 },
          { date: "2026-01-04", close: 106 },
        ],
        BBB: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 99 },
          { date: "2026-01-03", close: 98 },
          { date: "2026-01-04", close: 97 },
        ],
      },
      baselineTargetWeights: { AAA: 0.7, BBB: 0.3 },
      ensembleConfig: {
        momentum: 0.4,
        riskParity: 0.25,
        minVariance: 0.15,
        equalWeight: 0.2,
      },
      initialEquity: 10000,
      constraints: { maxIn: 1e9, maxOut: 1e9, minNotional: 0 },
      policy: { thresholdPct: 0.05, minTradeNotional: 0, cooldownSeconds: 0 },
    });

    expect(result.candidates.map((x) => x.id)).toEqual([
      "baseline",
      "momentum",
      "riskParity",
      "minVariance",
      "equalWeight",
      "ensemble",
    ]);

    const baseline = result.candidates.find((x) => x.id === "baseline");
    const ensemble = result.candidates.find((x) => x.id === "ensemble");
    expect(baseline).toBeTruthy();
    expect(ensemble).toBeTruthy();

    expect(Number.isFinite(baseline?.backtest.metrics.totalReturn)).toBe(true);
    expect(Number.isFinite(ensemble?.backtest.metrics.sharpe)).toBe(true);
  });

  it("builds sorted write-back diffs", () => {
    const rows = buildTargetWeightDiffRowsV1(
      { AAA: 0.6, BBB: 0.4 },
      { AAA: 0.3, BBB: 0.5, CCC: 0.2 },
    );

    expect(rows.length).toBe(3);
    expect(rows[0].symbol).toBe("AAA");
    expect(rows[0].deltaWeight).toBeLessThan(0);
  });
});
