import { describe, it, expect } from "vitest";

import { ensembleSignals, DEFAULT_SIGNAL_THRESHOLDS } from "../signals.js";
import { buyAndHold, smaCrossover } from "../strategies.js";
import { DEFAULT_ENSEMBLE_WEIGHTS } from "../config.js";

function makeSeries({ n = 60, start = 100, daily = 0.002 } = {}) {
  const out = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    out.push({ date: `2026-02-${String(i + 1).padStart(2, "0")}`, close: v });
    v = v * (1 + daily);
  }
  return out;
}

describe("ensembleSignals", () => {
  it("produces signals of correct length and valid actions", () => {
    const series = makeSeries({ n: 50, daily: 0.001 });
    const strategies = [buyAndHold(), smaCrossover({ fast: 5, slow: 20 })];

    const sigs = ensembleSignals(strategies, series, DEFAULT_ENSEMBLE_WEIGHTS, {
      ...DEFAULT_SIGNAL_THRESHOLDS,
      buyAbove: 0.6,
      sellBelow: 0.4,
    });

    expect(sigs.length).toBe(series.length);
    expect(sigs.every((s) => ["BUY", "SELL", "HOLD"].includes(s.action))).toBe(true);
    expect(sigs.every((s) => s.targetWeight >= 0 && s.targetWeight <= 1)).toBe(true);
    expect(sigs.every((s) => s.confidence >= 0 && s.confidence <= 1)).toBe(true);
  });

  it("has transparent reasons", () => {
    const series = makeSeries({ n: 30, daily: 0.001 });
    const sigs = ensembleSignals([buyAndHold(), smaCrossover({ fast: 5, slow: 20 })], series, DEFAULT_ENSEMBLE_WEIGHTS);
    expect(sigs[0].reasons.length).toBeGreaterThan(0);
    expect(String(sigs[0].reasons[0])).toContain("ensemble target");
  });
});
