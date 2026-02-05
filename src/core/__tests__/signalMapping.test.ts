import { describe, it, expect } from "vitest";

import { toSignals, DEFAULT_SIGNAL_THRESHOLDS } from "../signalMapping";

describe("toSignals", () => {
  it("throws when array lengths violate the contract", () => {
    expect(() => toSignals(["2026-02-01"], [0.5, 0.6], [[]] as string[][])).toThrow(/dates\.length/);
    expect(() => toSignals(["2026-02-01"], [0.5], [[], []] as string[][])).toThrow(/reasonsByDay\.length/);
  });

  it("throws on invalid thresholds (prevents silent bad signal mapping)", () => {
    const dates = ["2026-02-01"];
    const targetWeights = [0.5];
    const reasonsByDay = [[]] as string[][];

    expect(() =>
      toSignals(dates, targetWeights, reasonsByDay, {
        buyAbove: 0.4,
        sellBelow: 0.6,
        minChange: 0.1,
      })
    ).toThrow(/buyAbove/);

    expect(() =>
      toSignals(dates, targetWeights, reasonsByDay, {
        buyAbove: 0.6,
        sellBelow: 0.4,
        minChange: -0.1,
      })
    ).toThrow(/minChange/);
  });

  it("clamps non-finite target weights to a safe value", () => {
    const dates = ["2026-02-01", "2026-02-02"];
    const targetWeights = [Number.NaN, 0.8];
    const reasonsByDay = [[], []] as string[][];

    const sigs = toSignals(dates, targetWeights, reasonsByDay, DEFAULT_SIGNAL_THRESHOLDS);

    expect(sigs).toHaveLength(2);
    expect(sigs[0].targetWeight).toBe(0);
    expect(Number.isFinite(sigs[0].confidence)).toBe(true);
    expect(String(sigs[0].reasons[0])).toContain("ensemble target=0%");
    // The decision rule should remain the 2nd line even when warnings are present.
    expect(String(sigs[0].reasons[1])).toContain("rule:");
    // Warnings are included to make upstream data issues visible without breaking the API,
    // and should appear right after the decision rule for consistent explainability.
    expect(String(sigs[0].reasons[2])).toContain("warning: non-finite targetWeight");

    expect(sigs[1].targetWeight).toBe(0.8);
    expect(Number.isFinite(sigs[1].confidence)).toBe(true);
    // When the previous day is non-finite, we default prev=tw (so Δ=0) to avoid spurious jumps.
    expect(String(sigs[1].reasons[0])).toContain("Δ=0%");
    expect(String(sigs[1].reasons[1])).toContain("rule:");
    expect(String(sigs[1].reasons[2])).toContain("warning: previous targetWeight non-finite");
  });

  it("formats positive deltas with an explicit + sign for readability", () => {
    const dates = ["2026-02-01", "2026-02-02"];
    const targetWeights = [0.2, 0.8];
    const reasonsByDay = [[], []] as string[][];

    const sigs = toSignals(dates, targetWeights, reasonsByDay, DEFAULT_SIGNAL_THRESHOLDS);

    expect(String(sigs[1].reasons[0])).toContain("Δ=+60%");
  });

  it("includes the decision rule as the 2nd reason line for explainability", () => {
    const dates = ["2026-02-01", "2026-02-02"];
    const targetWeights = [0.2, 0.8];
    const reasonsByDay = [[], []] as string[][];

    const sigs = toSignals(dates, targetWeights, reasonsByDay, DEFAULT_SIGNAL_THRESHOLDS);

    expect(String(sigs[1].reasons[1])).toContain("rule:");
  });
});
