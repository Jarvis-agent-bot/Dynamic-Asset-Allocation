import { describe, expect, it } from "vitest";

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
      trigger: { driftThresholdPct: 0.01 },
    });

    expect(res.dailyReturns).toEqual([0, 0]);
    expect(res.equity[res.equity.length - 1]).toBeCloseTo(1, 10);
    expect(res.metrics.totalReturn).toBeCloseTo(0, 10);
    expect(res.events.map((e) => e.kind)).toEqual(["init"]);
    expect(res.summary.rebalanceCount).toBe(0);
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
      trigger: { driftThresholdPct: 0.1, minOrderNotional: 0 },
    });

    expect(res.metrics.totalReturn).toBeCloseTo(0.5, 8);
    expect(res.events.map((e) => e.kind)).toEqual(["init", "rebalance"]);

    const rebalance = res.events.find((e) => e.kind === "rebalance");
    expect(rebalance?.trigger.shouldRebalance).toBe(true);
    expect(rebalance?.turnoverNotional).toBeCloseTo(50, 8);
    expect(res.summary.rebalanceCount).toBe(1);
    expect(res.summary.turnoverNotional).toBeGreaterThanOrEqual(50);

    const timelinePoint = (res.timeline || []).find((t) => t.date === "2026-01-02");
    expect(timelinePoint?.trigger.shouldRebalance).toBe(true);
  });

  it("supports T+1 execution timing", () => {
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
      trigger: { driftThresholdPct: 0.1, minOrderNotional: 0 },
      execution: { timing: "t_plus_1_close" },
    });

    const rebalanceEvents = res.events.filter((event) => event.kind === "rebalance");
    expect(rebalanceEvents.length).toBe(1);
    expect(rebalanceEvents[0].signalDate).toBe("2026-01-02");
    expect(rebalanceEvents[0].date).toBe("2026-01-03");
    expect(rebalanceEvents[0].executionTiming).toBe("t_plus_1_close");
  });

  it("传入计划调仓日后只在这些日期打开新的再平衡信号", () => {
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
      rebalanceDates: ["2026-01-03"],
      initialEquity: 100,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      trigger: { driftThresholdPct: 0.1, minOrderNotional: 0 },
      execution: { timing: "t_plus_1_close" },
    });

    const rebalanceEvents = res.events.filter((event) => event.kind === "rebalance");
    expect(rebalanceEvents).toHaveLength(1);
    expect(rebalanceEvents[0].signalDate).toBe("2026-01-03");
    expect(rebalanceEvents[0].date).toBe("2026-01-04");
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
      trigger: { driftThresholdPct: 0.2, minOrderNotional: 0 },
      execution: {
        feeRateBps: 100,
        slippageBps: 100,
      },
    });

    expect(res.summary.totalFeesAbs).toBeGreaterThan(0);
    expect(res.summary.initialEquityAbs).toBeLessThan(100);
  });

  it("carries bootstrap costs into normalized equity and total return", () => {
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
      trigger: { driftThresholdPct: 0.2, minOrderNotional: 0 },
      execution: {
        feeRateBps: 100,
        slippageBps: 0,
      },
    });

    expect(res.summary.initialEquityAbs).toBeCloseTo(99.00990099, 8);
    expect(res.equity[0]).toBeCloseTo(0.9900990099, 8);
    expect(res.metrics.totalReturn).toBeCloseTo(-0.0099009901, 8);
  });

  it("rolls synthetic-bar orders forward by asset until the next real bar", () => {
    const res = backtestDriftRebalance({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 120 },
          { date: "2026-01-03", close: 125 },
        ],
        BBB: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 110 },
        ],
      },
      executableDatesBySymbol: {
        AAA: ["2026-01-01", "2026-01-02", "2026-01-03"],
        BBB: ["2026-01-01", "2026-01-03"],
      },
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      initialHoldings: { AAA: 1 },
      initialCash: 0,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      trigger: { driftThresholdPct: 0, minOrderNotional: 0, minRebalanceIntervalSeconds: 0 },
      execution: { timing: "t_plus_1_close" },
    });

    const rebalanceEvents = res.events.filter((event) => event.kind === "rebalance");
    expect(rebalanceEvents).toHaveLength(2);
    expect(rebalanceEvents[0].signalDate).toBe("2026-01-01");
    expect(rebalanceEvents[0].date).toBe("2026-01-02");
    expect(rebalanceEvents[0].orders.map((order) => order.symbol)).toEqual(["AAA"]);
    expect(rebalanceEvents[1].signalDate).toBe("2026-01-01");
    expect(rebalanceEvents[1].date).toBe("2026-01-03");
    expect(rebalanceEvents[1].orders.map((order) => order.symbol)).toEqual(["BBB"]);
    expect(res.summary.rebalanceCount).toBe(2);
  });

  it("supports targetWeightsByDate and keeps warm-up in cash until the first valid signal", () => {
    const res = backtestDriftRebalance({
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 1 },
          { date: "2026-01-02", close: 1 },
          { date: "2026-01-03", close: 1 },
          { date: "2026-01-04", close: 1 },
          { date: "2026-01-05", close: 1 },
        ],
      },
      targetWeightsByDate: {
        "2026-01-01": {},
        "2026-01-02": {},
        "2026-01-03": {},
        "2026-01-04": { AAA: 1 },
        "2026-01-05": { AAA: 1 },
      },
      initialEquity: 100,
      constraints: { maxOrderPctOfNav: 1, minNotional: 0 },
      trigger: { driftThresholdPct: 0, minOrderNotional: 0 },
      execution: { timing: "t_plus_1_close" },
    });

    expect(res.events.map((event) => event.kind)).toEqual(["rebalance"]);
    expect(res.events[0].signalDate).toBe("2026-01-04");
    expect(res.events[0].date).toBe("2026-01-05");
    expect(res.summary.rebalanceCount).toBe(1);
    expect(res.summary.turnoverNotional).toBeGreaterThan(0);
  });
});
