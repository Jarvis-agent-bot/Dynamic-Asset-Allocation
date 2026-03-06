import { describe, it, expect } from "vitest";

import { backtestDriftRebalance } from "../backtestDriftRebalance";

describe("backtestDriftRebalance", () => {
  it("boots from cash into target weights and keeps equity flat for flat prices", () => {
    const seriesBySymbol = {
      AAA: [
        { date: "2026-01-01", close: 1 },
        { date: "2026-01-02", close: 1 },
        { date: "2026-01-03", close: 1 },
      ],
      BBB: [
        { date: "2026-01-01", close: 2 },
        { date: "2026-01-02", close: 2 },
        { date: "2026-01-03", close: 2 },
      ],
    };

    const res = backtestDriftRebalance({
      seriesBySymbol,
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      initialEquity: 100,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.01 },
    });

    // 3 dates => 2 daily returns.
    expect(res.dailyReturns).toEqual([0, 0]);
    expect(res.equity[res.equity.length - 1]).toBeCloseTo(1, 10);
    expect(res.metrics.totalReturn).toBeCloseTo(0, 10);

    // Only the init event should exist.
    expect(res.events.map((e) => e.kind)).toEqual(["init"]);
    expect(res.summary.rebalanceCount).toBe(0);

    // Timeline is used by the Funds Hub UI (drift over time + trigger points).
    expect(Array.isArray(res.timeline)).toBe(true);
    expect(res.timeline?.length).toBe(3);
    expect(res.timeline?.[0]?.date).toBe("2026-01-01");
  });

  it("triggers a rebalance when drift exceeds threshold and records turnover", () => {
    const seriesBySymbol = {
      AAA: [
        { date: "2026-01-01", close: 1 },
        { date: "2026-01-02", close: 2 },
        { date: "2026-01-03", close: 2 },
      ],
      BBB: [
        { date: "2026-01-01", close: 1 },
        { date: "2026-01-02", close: 1 },
        { date: "2026-01-03", close: 1 },
      ],
    };

    const res = backtestDriftRebalance({
      seriesBySymbol,
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      initialEquity: 100,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.1, minTradeNotional: 0 },
    });

    // Day1 jump from 100 to 150 => +50% total return.
    expect(res.metrics.totalReturn).toBeCloseTo(0.5, 8);

    const kinds = res.events.map((e) => e.kind);
    expect(kinds).toEqual(["init", "rebalance"]);

    const reb = res.events.find((e) => e.kind === "rebalance");
    expect(reb?.trigger.shouldRebalance).toBe(true);

    // On 2026-01-02 after AAA doubled, target is 50/50 of equity 150 => desired 75/75.
    // Current is ~100/50, so we should sell 25 AAA and buy 25 BBB => turnover 50.
    expect(reb?.turnoverNotional).toBeCloseTo(50, 8);

    expect(res.summary.rebalanceCount).toBe(1);
    expect(res.summary.turnoverNotional).toBeGreaterThanOrEqual(50);

    const tp = (res.timeline || []).find((t) => t.date === "2026-01-02");
    expect(tp?.trigger.shouldRebalance).toBe(true);
  });

  it("supports T+1 execution timing (signal day and fill day are different)", () => {
    const seriesBySymbol = {
      AAA: [
        { date: "2026-01-01", close: 1 },
        { date: "2026-01-02", close: 2 },
        { date: "2026-01-03", close: 2 },
        { date: "2026-01-04", close: 2 },
      ],
      BBB: [
        { date: "2026-01-01", close: 1 },
        { date: "2026-01-02", close: 1 },
        { date: "2026-01-03", close: 1 },
        { date: "2026-01-04", close: 1 },
      ],
    };

    const res = backtestDriftRebalance({
      seriesBySymbol,
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      initialEquity: 100,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.1, minTradeNotional: 0 },
      execution: {
        timing: "t_plus_1_close",
      },
    });

    const rebalanceEvents = res.events.filter((event) => event.kind === "rebalance");
    expect(rebalanceEvents.length).toBe(1);
    expect(rebalanceEvents[0].signalDate).toBe("2026-01-02");
    expect(rebalanceEvents[0].date).toBe("2026-01-03");
    expect(rebalanceEvents[0].executionTiming).toBe("t_plus_1_close");
  });

  it("applies same-bar rebalance fee impact on the signal day return", () => {
    const res = backtestDriftRebalance({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 1 },
          { date: "2026-01-02", close: 2 },
          { date: "2026-01-03", close: 2 },
        ],
        BBB: [
          { date: "2026-01-01", close: 1 },
          { date: "2026-01-02", close: 1 },
          { date: "2026-01-03", close: 1 },
        ],
      },
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      initialHoldings: { AAA: 50, BBB: 50 },
      initialCash: 0,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.1, minTradeNotional: 0 },
      execution: {
        timing: "same_bar_close",
        feeRatePct: 0.1,
      },
    });

    expect(res.events.map((e) => e.kind)).toEqual(["rebalance"]);
    expect(res.summary.totalFeesAbs).toBeCloseTo(4.5454545455, 8);
    expect(res.dailyReturns[0]).toBeCloseTo(0.4545454545, 8);
    expect(res.dailyReturns[1]).toBeCloseTo(0, 8);
  });

  it("applies fee and slippage costs into turnover summary", () => {
    const res = backtestDriftRebalance({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 1 },
          { date: "2026-01-02", close: 1 },
          { date: "2026-01-03", close: 1 },
        ],
      },
      targetWeights: { AAA: 1 },
      initialEquity: 100,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.2, minTradeNotional: 0 },
      execution: {
        timing: "same_bar_close",
        feeRatePct: 0.01,
        slippageBps: 100,
      },
    });

    expect(res.summary.totalFeesAbs).toBeGreaterThan(0);
    expect(res.summary.initialEquityAbs).toBeLessThan(100);
  });

  it("deduplicates repeated missing-price warnings for the same holding", () => {
    const res = backtestDriftRebalance({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 1 },
          { date: "2026-01-02", close: 1 },
          { date: "2026-01-03", close: 1 },
        ],
      },
      targetWeights: { AAA: 1 },
      initialHoldings: { AAA: 10, MISSING: 5 },
      initialCash: 0,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.1, minTradeNotional: 0 },
    });

    const missingPriceWarnings = res.warnings.filter((w) =>
      w.includes("missing price for holding MISSING; excluded from valuation"),
    );

    expect(missingPriceWarnings).toHaveLength(1);
  });

  it("deduplicates repeated invalid-close warnings per symbol", () => {
    const res = backtestDriftRebalance({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 0 },
          { date: "2026-01-02", close: 0 },
          { date: "2026-01-03", close: 0 },
        ],
      },
      targetWeights: { AAA: 1 },
      initialEquity: 100,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.1, minTradeNotional: 0 },
    });

    const invalidCloseWarnings = res.warnings.filter((w) => w.includes("invalid close for AAA"));

    expect(invalidCloseWarnings).toHaveLength(1);
  });
});
