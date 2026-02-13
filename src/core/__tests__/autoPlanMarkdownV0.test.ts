import { describe, expect, it } from "vitest";

import { backtestDriftRebalance } from "../backtestDriftRebalance";
import { buildAutoPlanMarkdownV0 } from "../autoPlanMarkdownV0";

function bar(date: string, close: number) {
  return { date, close };
}

describe("auto plan markdown v0", () => {
  it("surfaces sell-blocker warnings in the plan markdown", () => {
    // Make the portfolio very overweight AAA, but cap maxOut below minTradeNotional.
    // This should generate a warning like:
    //   warning: constraints.maxOut=... < minTradeNotional=...; SELL orders may be suppressed.
    const res = backtestDriftRebalance({
      seriesBySymbol: {
        AAA: [bar("2026-01-01", 1), bar("2026-01-02", 1)],
        BBB: [bar("2026-01-01", 1), bar("2026-01-02", 1)],
      },
      targetWeights: { AAA: 0, BBB: 1 },
      initialHoldings: { AAA: 1000 },
      initialCash: 0,
      constraints: {
        maxOut: 50,
        maxIn: 1e9,
        minNotional: 0.01,
      },
      policy: {
        thresholdPct: 0,
        minTradeNotional: 100,
        cooldownSeconds: 0,
      },
      bootstrapToTarget: false,
      includeEventStates: true,
    });

    expect(res.warnings.some((w) => w.includes("SELL orders may be suppressed"))).toBe(true);

    const md = buildAutoPlanMarkdownV0(res);
    expect(md).toContain("## Warnings");
    expect(md).toContain("SELL orders may be suppressed");
    expect(md).toContain("constraints.maxOut=50.00");
    expect(md).toContain("minTradeNotional=100.00");
  });
});
