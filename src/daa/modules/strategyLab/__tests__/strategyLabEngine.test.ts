import { describe, expect, it } from "vitest";

import {
  buildTargetWeightDiffRows,
  prepareAlignedSeriesBySymbol,
  prepareAlignedSeriesBySymbolWithDiagnostics,
  runStrategyLabBacktests,
} from "../strategyLabEngine";

describe("strategyLabEngine", () => {
  it("aligns multi-symbol series by common dates", () => {
    const aligned = prepareAlignedSeriesBySymbol({
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
    const aligned = prepareAlignedSeriesBySymbol(
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


  it("tracks real observation dates separately in ffill_union mode", () => {
    const prepared = prepareAlignedSeriesBySymbolWithDiagnostics(
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

    expect(prepared.seriesBySymbol.BBB.map((item) => item.close)).toEqual([50, 50, 55, 56]);
    expect(prepared.observedDatesBySymbol.AAA).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
    expect(prepared.observedDatesBySymbol.BBB).toEqual(["2026-01-01", "2026-01-03", "2026-01-04"]);
  });


  it("does not let synthetic bars satisfy minBars in ffill_union mode", () => {
    const prepared = prepareAlignedSeriesBySymbolWithDiagnostics(
      {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 101 },
          { date: "2026-01-03", close: 102 },
          { date: "2026-01-04", close: 103 },
        ],
        BBB: [
          { date: "2026-01-01", close: 50 },
          { date: "2026-01-04", close: 55 },
        ],
      },
      { mode: "ffill_union", minBars: 4 },
    );

    expect(Object.keys(prepared.seriesBySymbol)).toEqual(["AAA"]);
    expect(prepared.diagnostics.droppedSymbols).toEqual(["BBB"]);
    expect(prepared.observedDatesBySymbol.BBB).toBeUndefined();
  });

  it("uses only real observations for ffill_union statistics", () => {
    const prepared = prepareAlignedSeriesBySymbolWithDiagnostics(
      {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 101 },
          { date: "2026-01-03", close: 102 },
          { date: "2026-01-04", close: 103 },
        ],
        BBB: [
          { date: "2026-01-01", close: 50 },
          { date: "2026-01-03", close: 55 },
          { date: "2026-01-04", close: 56 },
        ],
      },
      { mode: "ffill_union" },
    );

    const result = runStrategyLabBacktests({
      seriesBySymbol: prepared.seriesBySymbol,
      observedDatesBySymbol: prepared.observedDatesBySymbol,
      executableDatesBySymbol: prepared.observedDatesBySymbol,
      baselineTargetWeights: { AAA: 0.5, BBB: 0.5 },
      ensembleConfig: {
        momentum: 0.25,
        riskParity: 0.25,
        minVariance: 0.25,
        equalWeight: 0.25,
      },
      lookbackBars: 3,
      initialEquity: 10000,
      constraints: { maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0, minTradeNotional: 0, cooldownSeconds: 0 },
    });

    const riskParity = result.candidates.find((item) => item.id === "riskParity");
    const minVariance = result.candidates.find((item) => item.id === "minVariance");

    expect(riskParity?.targetWeightsByDate["2026-01-04"]).toEqual({ AAA: 1 });
    expect(minVariance?.targetWeightsByDate["2026-01-04"]).toEqual({ AAA: 1 });
  });

  it("builds strict walk-forward target weights without using future bars", () => {
    const result = runStrategyLabBacktests({
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

  it("boots static candidates from sample start while dynamic candidates still wait for the first signal", () => {
    const result = runStrategyLabBacktests({
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
    const equalWeight = result.candidates.find((item) => item.id === "equalWeight");
    const momentum = result.candidates.find((item) => item.id === "momentum");

    expect(baseline?.backtest.events[0]?.kind).toBe("init");
    expect(baseline?.backtest.events[0]?.signalDate).toBe("2026-01-01");
    expect(baseline?.backtest.events[0]?.date).toBe("2026-01-01");

    expect(equalWeight?.backtest.events[0]?.kind).toBe("init");
    expect(equalWeight?.backtest.events[0]?.signalDate).toBe("2026-01-01");
    expect(equalWeight?.backtest.events[0]?.date).toBe("2026-01-01");

    expect(momentum?.backtest.events.map((event) => event.kind)).toEqual(["rebalance"]);
    expect(momentum?.backtest.events[0].signalDate).toBe("2026-01-03");
    expect(momentum?.backtest.events[0].date).toBe("2026-01-04");
  });


  it("keeps baseline implicit cash instead of normalizing it into a full-invested portfolio", () => {
    const result = runStrategyLabBacktests({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 100 },
          { date: "2026-01-04", close: 100 },
        ],
        BBB: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 100 },
          { date: "2026-01-04", close: 100 },
        ],
      },
      baselineTargetWeights: { AAA: 0.6 },
      ensembleConfig: {
        momentum: 0.4,
        riskParity: 0.25,
        minVariance: 0.15,
        equalWeight: 0.2,
      },
      lookbackBars: 2,
      initialEquity: 100,
      constraints: { maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0, minTradeNotional: 0, cooldownSeconds: 0 },
    });

    const baseline = result.candidates.find((item) => item.id === "baseline");
    expect(baseline?.targetWeights).toEqual({ AAA: 0.6 });
    expect(baseline?.targetWeightsByDate["2026-01-04"]).toEqual({ AAA: 0.6 });
    expect(baseline?.backtest.summary.turnoverNotional).toBeCloseTo(60, 8);
    expect(baseline?.backtest.portfolioByDate[0]?.cashPct01).toBeCloseTo(0.4, 8);
  });

  it("does not silently fall back to equalWeight when a candidate is unavailable", () => {
    const result = runStrategyLabBacktests({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 100 },
          { date: "2026-01-04", close: 100 },
        ],
        BBB: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 100 },
          { date: "2026-01-04", close: 100 },
        ],
      },
      baselineTargetWeights: { AAA: 0.7, BBB: 0.3 },
      ensembleConfig: {
        momentum: 0.4,
        riskParity: 0.3,
        minVariance: 0.3,
        equalWeight: 0,
      },
      lookbackBars: 2,
      initialEquity: 10000,
      constraints: { maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0, minTradeNotional: 0, cooldownSeconds: 0 },
    });

    const momentum = result.candidates.find((item) => item.id === "momentum");
    const riskParity = result.candidates.find((item) => item.id === "riskParity");
    const minVariance = result.candidates.find((item) => item.id === "minVariance");
    const ensemble = result.candidates.find((item) => item.id === "ensemble");
    const equalWeight = result.candidates.find((item) => item.id === "equalWeight");

    expect(momentum?.targetWeights).toEqual({});
    expect(riskParity?.targetWeights).toEqual({});
    expect(minVariance?.targetWeights).toEqual({});
    expect(ensemble?.targetWeights).toEqual({});
    expect(equalWeight?.targetWeights).toEqual({ AAA: 0.5, BBB: 0.5 });

    expect(momentum?.warnings || []).toEqual([]);
    expect((riskParity?.warnings || []).some((warning) => warning.includes("volatility unavailable"))).toBe(true);
    expect((minVariance?.warnings || []).some((warning) => warning.includes("covariance unavailable"))).toBe(true);
    expect((ensemble?.warnings || []).some((warning) => warning.includes("all active component strategies unavailable"))).toBe(true);
    expect(minVariance?.backtest.events || []).toEqual([]);
  });

  it("builds sorted write-back diffs", () => {
    const rows = buildTargetWeightDiffRows(
      { AAA: 0.6, BBB: 0.4 },
      { AAA: 0.3, BBB: 0.5, CCC: 0.2 },
    );

    expect(rows.length).toBe(3);
    expect(rows[0].symbol).toBe("AAA");
    expect(rows[0].deltaWeight).toBeLessThan(0);
  });


  it("preserves implicit cash when building diff rows", () => {
    const rows = buildTargetWeightDiffRows(
      { AAA: 0.6 },
      { AAA: 1 },
    );

    expect(rows).toEqual([
      {
        symbol: "AAA",
        currentWeight: 0.6,
        nextWeight: 1,
        deltaWeight: 0.4,
      },
    ]);
  });
});
