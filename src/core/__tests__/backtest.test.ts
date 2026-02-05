import { describe, it, expect } from "vitest";

import { backtestSingleAsset, runBacktests } from "../backtest";
import { buyAndHold, smaCrossover } from "../strategies";

function makeTrendSeries({ n = 60, start = 100, daily = 0.002 } = {}) {
  const out = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    out.push({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, close: v });
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

  it("treats invalid prices as 0% returns (prevents NaN propagation)", () => {
    const series = makeTrendSeries({ n: 5, daily: 0.002 });
    series[2] = { ...series[2], close: Number.NaN };

    const res = backtestSingleAsset(buyAndHold(), series);
    expect(res.dailyReturns.every((x) => Number.isFinite(x))).toBe(true);
    expect(res.equity.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);
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
