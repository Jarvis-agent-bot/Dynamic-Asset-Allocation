import { describe, it, expect } from "vitest";

import { toSignals, DEFAULT_SIGNAL_THRESHOLDS } from "../signalMapping";

describe("toSignals", () => {
  it("throws when array lengths violate the contract", () => {
    expect(() => toSignals(["2026-02-01"], [0.5, 0.6], [[]] as string[][])).toThrow(/dates\.length/);
    expect(() => toSignals(["2026-02-01"], [0.5], [[], []] as string[][])).toThrow(/reasonsByDay\.length/);
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

    expect(sigs[1].targetWeight).toBe(0.8);
    expect(Number.isFinite(sigs[1].confidence)).toBe(true);
    // When the previous day is non-finite, we default prev=tw (so Δ=0) to avoid spurious jumps.
    expect(String(sigs[1].reasons[0])).toContain("Δ=0%");
  });

  it("formats positive deltas with an explicit + sign for readability", () => {
    const dates = ["2026-02-01", "2026-02-02"];
    const targetWeights = [0.2, 0.8];
    const reasonsByDay = [[], []] as string[][];

    const sigs = toSignals(dates, targetWeights, reasonsByDay, DEFAULT_SIGNAL_THRESHOLDS);

    expect(String(sigs[1].reasons[0])).toContain("Δ=+60%");
  });
});
