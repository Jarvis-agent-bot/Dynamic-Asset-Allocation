// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StrategyLabEquityChart } from "../StrategyLabEquityChart";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StrategyLabEquityChart", () => {
  it("初始无法测量容器尺寸时仍会渲染图表，而不是首屏空白", () => {
    vi.stubGlobal("ResizeObserver", undefined);

    const { container } = render(
      <StrategyLabEquityChart
        baseCurrency="USD"
        chartData={[
          { date: "2026-01-01", equalWeight: 100000, "benchmark:SPY": 100000 },
          { date: "2026-01-02", equalWeight: 101000, "benchmark:SPY": 100500 },
        ]}
        strategyResults={[
          {
            strategy: "equalWeight",
            equityCurve: [
              { date: "2026-01-01", equity: 100000 },
              { date: "2026-01-02", equity: 101000 },
            ],
            metrics: {
              totalReturn: 0.01,
              annualizedReturn: 0.01,
              annualizationFactor: 252,
              maxDrawdown: 0,
              sharpe: 1,
              winRate: 1,
            },
            attribution: {
              totalReturn: 0.01,
              benchmark: { symbol: "SPY", return: 0.005, coverage: "full" },
              activeReturn: 0.005,
              perAsset: [],
              rebalanceEvents: [],
              metrics: {
                sharpe: 1,
                maxDrawdown: 0,
                annualizedReturn: 0.01,
                annualizationFactor: 252,
                calmar: 0,
                volatility: 0.01,
                winRate: 1,
              },
            },
            targetWeights: { "US::SPY": 1 },
            warnings: [],
          },
        ]}
        benchmarkResults={[
          {
            symbol: "SPY",
            label: "标普500",
            equityCurve: [
              { date: "2026-01-01", equity: 100000 },
              { date: "2026-01-02", equity: 100500 },
            ],
            coverage: "full",
            return: 0.005,
          },
        ]}
      />,
    );

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
