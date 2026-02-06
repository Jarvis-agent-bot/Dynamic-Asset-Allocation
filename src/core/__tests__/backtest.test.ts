import { describe, it, expect } from "vitest";

import { backtestSingleAsset, runBacktests } from "../backtest";
import type { PriceBar } from "../domain";
import { buyAndHold, smaCrossover } from "../strategies";

function makeTrendSeries({ n = 60, start = 100, daily = 0.002 } = {}) {
  const out: Array<{ date: string; close: number }> = [];
  let v = start;

  const startDate = new Date("2026-01-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    out.push({ date: d.toISOString().slice(0, 10), close: v });
    v = v * (1 + daily);
  }

  return out;
}

describe("backtestSingleAsset", () => {
  it("buy & hold on a rising series produces positive total return", () => {
    const series = makeTrendSeries({ n: 50, daily: 0.003 });
    const res = backtestSingleAsset(buyAndHold(), series);
    expect(res.metrics.totalReturn).toBeGreaterThan(0);
    expect(res.equity.length).toBe(series.length - 1);
  });

  it("sma crossover returns a valid result and stays within bounds", () => {
    const series = makeTrendSeries({ n: 80, daily: 0.001 });
    const strat = smaCrossover({ fast: 5, slow: 20 });
    const res = backtestSingleAsset(strat, series);

    expect(res.dailyReturns.length).toBe(series.length - 1);
    expect(res.equity.length).toBe(series.length - 1);
    // Sanity: equity should be finite and >= 0
    expect(res.equity.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);
  });

  it("throws if series dates are not strictly increasing", () => {
    const series = makeTrendSeries({ n: 5, daily: 0.002 });
    // Make it non-increasing at index 2
    series[2] = { ...series[2], date: series[1].date };

    expect(() => backtestSingleAsset(buyAndHold(), series as PriceBar[])).toThrow(
      /dates must be strictly increasing/i
    );
  });

  it("throws if a series date is missing/invalid (provider contract)", () => {
    const series = makeTrendSeries({ n: 5, daily: 0.002 }) as any[];
    series[0] = { ...series[0], date: "" };

    expect(() => backtestSingleAsset(buyAndHold(), series as PriceBar[])).toThrow(/date must be a non-empty string/i);
  });

  it("throws if a series date is not YYYY-MM-DD or is not a valid calendar date", () => {
    const series = makeTrendSeries({ n: 5, daily: 0.002 }) as any[];

    series[1] = { ...series[1], date: "01/02/2026" };
    expect(() => backtestSingleAsset(buyAndHold(), series as PriceBar[])).toThrow(/YYYY-MM-DD/i);

    series[1] = { ...series[1], date: "2026-13-40" };
    expect(() => backtestSingleAsset(buyAndHold(), series as PriceBar[])).toThrow(/valid calendar date/i);
  });

  it("treats invalid prices as 0% returns (prevents NaN propagation)", () => {
    const series = makeTrendSeries({ n: 5, daily: 0.002 });
    series[2] = { ...series[2], close: Number.NaN };

    const res = backtestSingleAsset(buyAndHold(), series);
    expect(res.dailyReturns.every((x) => Number.isFinite(x))).toBe(true);
    expect(res.equity.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);
  });

  it("treats non-finite strategy weights as 0 (prevents accidental full-risk exposure)", () => {
    const series = makeTrendSeries({ n: 6, daily: 0.01 });

    const strat = {
      id: "bad_w",
      name: "bad_w",
      weights: (s: PriceBar[]) => s.map((_, i) => (i === 2 ? Number.POSITIVE_INFINITY : 1)),
    };

    const res = backtestSingleAsset(strat as any, series as PriceBar[]);
    expect(res.dailyReturns.every((x) => Number.isFinite(x))).toBe(true);
    expect(res.equity.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);

    // The day with invalid weight should behave like 0 weight.
    // weight at day i applies to return i->i+1, so i=2 affects dailyReturns[2].
    expect(res.dailyReturns[2]).toBe(0);
  });

  it("does not cascade invalid-prev into all subsequent days", () => {
    const series = makeTrendSeries({ n: 6, daily: 0.01 });
    // First day invalid: day-1 return must be 0, but later valid days should still produce finite output.
    series[0] = { ...series[0], close: 0 };

    const res = backtestSingleAsset(buyAndHold(), series);
    expect(res.dailyReturns[0]).toBe(0);
    expect(res.dailyReturns.every((x) => Number.isFinite(x))).toBe(true);
    expect(res.equity.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);
  });

  it("breaks the prev-close chain on invalid mid-series prices (no stale prev)", () => {
    // If a mid-series day is invalid, we emit 0% for that day AND the next day
    // (until a valid prev-close is re-established), then resume normal returns.
    const series = [
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 110 }, // +10%
      { date: "2026-01-03", close: Number.NaN }, // invalid
      { date: "2026-01-04", close: 121 }, // would be +10% vs stale 110, but should be 0% because prev is broken
      { date: "2026-01-05", close: 133.1 }, // +10% vs 121
    ];

    const res = backtestSingleAsset(buyAndHold(), series as PriceBar[]);
    expect(res.dailyReturns).toHaveLength(series.length - 1);

    // 1->2
    expect(res.dailyReturns[0]).toBeCloseTo(0.1, 8);
    // invalid day
    expect(res.dailyReturns[1]).toBe(0);
    // day after invalid should also be 0 (re-establish prevClose)
    expect(res.dailyReturns[2]).toBe(0);
    // resume normal returns
    expect(res.dailyReturns[3]).toBeCloseTo(0.1, 8);
  });
});

describe("runBacktests", () => {
  it("runs multiple strategies", () => {
    const series = makeTrendSeries({ n: 60, daily: 0.002 });
    const results = runBacktests([buyAndHold(), smaCrossover({ fast: 3, slow: 10 })], series);
    expect(results).toHaveLength(2);
    expect(results[0].metrics).toHaveProperty("sharpe");
    expect(results[1].metrics).toHaveProperty("maxDrawdown");
  });
});
