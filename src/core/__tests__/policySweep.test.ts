import { describe, expect, it } from "vitest";

import type { DriftRebalanceBacktestRequest } from "../backtestDriftRebalance";
import { sweepDriftRebalancePolicy } from "../policySweep";

describe("policySweep", () => {
  function baseReq(): DriftRebalanceBacktestRequest {
    return {
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 1 },
          { date: "2026-01-02", close: 2 },
          { date: "2026-01-03", close: 1 },
          { date: "2026-01-04", close: 2 },
          { date: "2026-01-05", close: 1 },
        ],
        BBB: [
          { date: "2026-01-01", close: 1 },
          { date: "2026-01-02", close: 1 },
          { date: "2026-01-03", close: 1 },
          { date: "2026-01-04", close: 1 },
          { date: "2026-01-05", close: 1 },
        ],
      },
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      initialEquity: 100,
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      bootstrapToTarget: true,
    };
  }

  it("runs all combos and returns a stable sorted ranking", () => {
    const res = sweepDriftRebalancePolicy(baseReq(), {
      thresholdPct: [0.05, 0.2],
      minTradeNotional: [0],
      cooldownSeconds: [0, 999999],
      maxRuns: 10,
      topN: 10,
    });

    expect(res.schemaVersion).toBe(1);
    expect(res.runs).toBe(4);
    expect(res.rows).toHaveLength(4);
    expect(res.top).toHaveLength(4);
    expect(res.best).not.toBeNull();

    // Sorted by score desc.
    for (let i = 0; i < res.rows.length - 1; i++) {
      expect(res.rows[i].score).toBeGreaterThanOrEqual(res.rows[i + 1].score);
    }
  });

  it("blocks oversized sweeps via maxRuns", () => {
    expect(() =>
      sweepDriftRebalancePolicy(baseReq(), {
        thresholdPct: [0.01, 0.02, 0.03],
        minTradeNotional: [0, 10],
        cooldownSeconds: [0, 60, 120],
        maxRuns: 10,
      })
    ).toThrow(/exceeds maxRuns/);
  });

  it("reflects cooldown impact (very large cooldown usually reduces rebalanceCount)", () => {
    const res = sweepDriftRebalancePolicy(baseReq(), {
      thresholdPct: [0.05],
      minTradeNotional: [0],
      cooldownSeconds: [0, 999999],
      maxRuns: 10,
    });

    const byCooldown = new Map(res.rows.map((r) => [r.policy.cooldownSeconds, r.summary.rebalanceCount]));

    expect(byCooldown.get(0)).toBeGreaterThanOrEqual(byCooldown.get(999999) ?? 0);
  });
});
