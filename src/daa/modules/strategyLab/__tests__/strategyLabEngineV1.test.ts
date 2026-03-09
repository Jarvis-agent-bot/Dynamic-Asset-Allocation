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

  it("builds strict walk-forward target weights without using future bars", () => {
    const result = runStrategyLabBacktestsV1({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 110 },
          { date: "2026-01-03", close: 120 },
          { date: "2026-01-04", close: 130 },
          { date: "2026-01-05", close: 130 },
          { date: "2026-01-06", close: 130 },
        ],
        BBB: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 100 },
          { date: "2026-01-04", close: 100 },
          { date: "2026-01-05", close: 300 },
          { date: "2026-01-06", close: 300 },
        ],
      },
      baselineTargetWeights: { AAA: 0.7, BBB: 0.3 },
      ensembleConfig: {
        momentum: 0.4,
        riskParity: 0.25,
        minVariance: 0.15,
        equalWeight: 0.2,
      },
      lookbackBars: 2,
      initialEquity: 10000,
      constraints: { maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0.05, minTradeNotional: 0, cooldownSeconds: 0 },
    });

    const momentum = result.candidates.find((x) => x.id === "momentum");
    const baseline = result.candidates.find((x) => x.id === "baseline");
    const equalWeight = result.candidates.find((x) => x.id === "equalWeight");
    const ensemble = result.candidates.find((x) => x.id === "ensemble");

    expect(momentum).toBeTruthy();
    expect(baseline).toBeTruthy();
    expect(equalWeight).toBeTruthy();
    expect(ensemble).toBeTruthy();

    expect(momentum?.targetWeightsByDate["2026-01-01"]).toEqual({});
    expect(momentum?.targetWeightsByDate["2026-01-02"]).toEqual({});
    expect(momentum?.targetWeightsByDate["2026-01-04"].AAA || 0).toBeGreaterThan(momentum?.targetWeightsByDate["2026-01-04"].BBB || 0);
    expect(momentum?.targetWeightsByDate["2026-01-05"].AAA || 0).toBeGreaterThan(momentum?.targetWeightsByDate["2026-01-05"].BBB || 0);
    expect(momentum?.targetWeightsByDate["2026-01-06"].BBB || 0).toBeGreaterThan(momentum?.targetWeightsByDate["2026-01-06"].AAA || 0);

    expect(baseline?.targetWeightsByDate["2026-01-04"]).toEqual({ AAA: 0.7, BBB: 0.3 });
    expect(equalWeight?.targetWeightsByDate["2026-01-04"]).toEqual({ AAA: 0.5, BBB: 0.5 });
    expect(ensemble?.targetWeightsByDate["2026-01-04"]).toBeTruthy();
  });

  it("keeps the portfolio in cash during warm-up and waits for T+1 close to build the first position", () => {
    const result = runStrategyLabBacktestsV1({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 101 },
          { date: "2026-01-03", close: 102 },
          { date: "2026-01-04", close: 103 },
        ],
        BBB: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 100 },
          { date: "2026-01-04", close: 100 },
        ],
      },
      baselineTargetWeights: { AAA: 0.6, BBB: 0.4 },
      ensembleConfig: {
        momentum: 0.4,
        riskParity: 0.25,
        minVariance: 0.15,
        equalWeight: 0.2,
      },
      lookbackBars: 2,
      initialEquity: 10000,
      constraints: { maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0, minTradeNotional: 0, cooldownSeconds: 0 },
    });

    const baseline = result.candidates.find((item) => item.id === "baseline");
    expect(baseline?.backtest.events.map((event) => event.kind)).toEqual(["rebalance"]);
    expect(baseline?.backtest.events[0].signalDate).toBe("2026-01-03");
    expect(baseline?.backtest.events[0].date).toBe("2026-01-04");
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
