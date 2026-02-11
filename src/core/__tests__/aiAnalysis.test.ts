import { describe, expect, it } from "vitest";

import { analyzeDaaRecommendation } from "../aiAnalysis";

describe("analyzeDaaRecommendation", () => {
  it("suggests relaxed constraints when constraints exist", () => {
    const a = analyzeDaaRecommendation({
      baselineRequest: {
        money_plan: {
          constraints: { maxPositionPct: 0.2, maxIn: 1000, maxOut: 500 },
          allocations: [],
          account: {},
        },
        signals: [],
      },
      baselineResponse: {
        orders: [],
        targetWeights: [{ id: "SPY", targetPct: 0.3 }],
        warnings: ["capped"],
      },
      marketEvents: [],
    });

    expect(a.alternatives.find((x) => x.name.toLowerCase().includes("relax"))?.constraintPatch.maxPositionPct).toBeCloseTo(0.3, 8);
    expect(a.baselineNotes.join("\n")).toMatch(/exceed maxPositionPct/i);
  });

  it("adds market notes for matching symbols", () => {
    const a = analyzeDaaRecommendation({
      baselineRequest: { money_plan: { constraints: { maxPositionPct: 0.2, maxIn: 0, maxOut: 0 }, allocations: [], account: {} }, signals: [] },
      baselineResponse: { orders: [{ symbol: "SPY", side: "BUY", notional: 100 }], warnings: [] },
      marketEvents: [
        {
          id: "e1",
          source: "news",
          ts: "2026-02-11T00:00:00Z",
          title: "SPY sees inflows",
          summary: "Market is optimistic",
        },
      ],
    });

    expect(a.marketNotes.join("\n")).toContain("SPY:");
  });
});
