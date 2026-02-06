import { describe, expect, it } from "vitest";

import type { PriceBar } from "../domain";
import { backtestSingleAsset } from "../backtest";
import { buyAndHold } from "../strategies";
import {
  fetchValidatedPriceSeriesEnforcingRange,
  type PriceSeriesProvider,
  type PriceSeriesRequest,
} from "../providers";

function bar(date: string, close: number): PriceBar {
  return { date, close };
}

describe("framework v0 e2e (provider -> validated series -> backtest)", () => {
  it("runs a minimal end-to-end flow", async () => {
    const provider: PriceSeriesProvider = {
      name: "mock",
      async getPriceSeries(req: PriceSeriesRequest) {
        // A tiny deterministic series that satisfies the framework v0 contracts.
        // Respect the inclusive request range.
        const all = [
          bar("2026-01-01", 100),
          bar("2026-01-02", 101),
          bar("2026-01-03", 102),
        ];

        const start = req.start ?? all[0].date;
        const end = req.end ?? all[all.length - 1].date;
        return all.filter((b) => b.date >= start && b.date <= end);
      },
    };

    const series = await fetchValidatedPriceSeriesEnforcingRange(provider, {
      symbol: "SPY",
      start: "2026-01-01",
      end: "2026-01-03",
    });

    const res = backtestSingleAsset(buyAndHold(), series);

    // Buy & hold equity should track close/firstClose.
    // Note: equity is aligned to daily returns (i -> i+1), so the first equity point
    // corresponds to the first close-to-close return.
    expect(res.equity[0]).toBeCloseTo(101 / 100);
    expect(res.equity.at(-1)).toBeCloseTo(102 / 100);

    // Sanity: metrics should be present and finite.
    expect(Number.isFinite(res.metrics.totalReturn)).toBe(true);
    expect(Number.isFinite(res.metrics.maxDrawdown)).toBe(true);
    expect(Number.isFinite(res.metrics.sharpe)).toBe(true);
  });
});
