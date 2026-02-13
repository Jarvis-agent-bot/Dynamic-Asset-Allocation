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
});
