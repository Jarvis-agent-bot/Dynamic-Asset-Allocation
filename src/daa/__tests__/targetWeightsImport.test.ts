import { describe, expect, it } from "vitest";

import { normalizeTargetWeightsInput, parseTargetWeightsJson } from "../../../app/daa/targetWeightsStore";

describe("targetWeights import", () => {
  it("accepts map form", () => {
    const items = normalizeTargetWeightsInput({ SPY: 0.6, TLT: 0.4 });
    expect(items.map((x) => x.id).sort()).toEqual(["SPY", "TLT"]);
    expect(items.find((x) => x.id === "SPY")?.targetPct).toBeCloseTo(0.6, 8);
    expect(items.find((x) => x.id === "TLT")?.targetPct).toBeCloseTo(0.4, 8);
  });

  it("accepts state wrapper {schemaVersion,targetWeights}", () => {
    const items = normalizeTargetWeightsInput({
      schemaVersion: 1,
      updatedAt: "2026-02-13T00:00:00.000Z",
      targetWeights: { SPY: 0.6, TLT: 0.4 },
    });

    // Regression: schemaVersion should not be treated as a weight row.
    expect(items.map((x) => x.id).sort()).toEqual(["SPY", "TLT"]);
  });

  it("accepts engine-like wrapper {money_plan:{allocations:[...]}}", () => {
    const items = normalizeTargetWeightsInput({
      money_plan: {
        allocations: [
          { id: "SPY", label: "S&P 500", targetPct: 60 },
          { symbol: "TLT", name: "TLT", weight: 0.4 },
        ],
      },
    });

    expect(items.map((x) => x.id).sort()).toEqual(["SPY", "TLT"]);
    expect(items.find((x) => x.id === "SPY")?.targetPct).toBeCloseTo(0.6, 8);
    expect(items.find((x) => x.id === "TLT")?.targetPct).toBeCloseTo(0.4, 8);
  });

  it("accepts engine response wrapper {target_weights:{...}}", () => {
    const items = normalizeTargetWeightsInput({
      target_weights: {
        AAA: 0.25,
        BBB: 0.75,
      },
    });

    expect(items.map((x) => x.id).sort()).toEqual(["AAA", "BBB"]);
  });

  it("parseTargetWeightsJson extracts from common wrappers", () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      targetWeights: [{ id: "AAA", label: "AAA", targetPct: 0.1 }],
    });

    const parsed = parseTargetWeightsJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value).toEqual([{ id: "AAA", label: "AAA", targetPct: 0.1 }]);
  });
});
