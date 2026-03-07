import { describe, expect, it } from "vitest";

import { driftRebalanceStages } from "../backtest/driftRebalanceEngine";

describe("driftRebalanceStages", () => {
  it("signal + plan stage: queues T+1 execution when trigger fires", () => {
    const decision = driftRebalanceStages.signal({
      holdings: { AAA: 50, BBB: 50 },
      cash: 0,
      prices: { AAA: 2, BBB: 1 },
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.1, minTradeNotional: 0 },
      lastRebalanceAt: "",
      now: "2026-01-02T00:00:00.000Z",
    });

    expect(decision.trigger.shouldRebalance).toBe(true);

    const plan = driftRebalanceStages.plan({
      decision,
      signalDate: "2026-01-02",
      dayIndex: 1,
      dayCount: 4,
      timing: "t_plus_1_close",
    });

    expect(plan.kind).toBe("queue");
    if (plan.kind !== "queue") throw new Error("expected queue plan");
    expect(plan.pendingFill.signalDate).toBe("2026-01-02");
    expect(plan.pendingFill.orders.length).toBeGreaterThan(0);
  });

  it("plan stage: skips T+1 signal on final bar", () => {
    const decision = driftRebalanceStages.signal({
      holdings: { AAA: 50, BBB: 50 },
      cash: 0,
      prices: { AAA: 2, BBB: 1 },
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.1, minTradeNotional: 0 },
      lastRebalanceAt: "",
      now: "2026-01-04T00:00:00.000Z",
    });

    const plan = driftRebalanceStages.plan({
      decision,
      signalDate: "2026-01-04",
      dayIndex: 3,
      dayCount: 4,
      timing: "t_plus_1_close",
    });

    expect(plan.kind).toBe("skip");
    if (plan.kind !== "skip") throw new Error("expected skip plan");
    expect(plan.warning).toContain("no next bar");
  });

  it("execute + ledger stages: applies same-bar fees into day ledger", () => {
    const decision = driftRebalanceStages.signal({
      holdings: { AAA: 50, BBB: 50 },
      cash: 0,
      prices: { AAA: 2, BBB: 1 },
      targetWeights: { AAA: 0.5, BBB: 0.5 },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0.1, minTradeNotional: 0 },
      lastRebalanceAt: "",
      now: "2026-01-02T00:00:00.000Z",
    });

    const plan = driftRebalanceStages.plan({
      decision,
      signalDate: "2026-01-02",
      dayIndex: 1,
      dayCount: 3,
      timing: "same_bar_close",
    });

    expect(plan.kind).toBe("execute");
    if (plan.kind !== "execute") throw new Error("expected execute plan");

    const equityAbsByDay: number[] = [];
    const warnings: string[] = [];

    driftRebalanceStages.ledgerRecord({
      equityAbsByDay,
      holdings: { AAA: 50, BBB: 50 },
      cash: 0,
      prices: { AAA: 2, BBB: 1 },
      warnings,
    });

    expect(equityAbsByDay[0]).toBeCloseTo(150, 8);

    const executed = driftRebalanceStages.execute({
      fill: plan.fill,
      fillDate: "2026-01-02",
      timing: "same_bar_close",
      holdings: { AAA: 50, BBB: 50 },
      cash: 0,
      prices: { AAA: 2, BBB: 1 },
      includeEventStates: true,
      feeRatePct: 0.1,
      slippageBps: 0,
      warnings,
    });

    driftRebalanceStages.ledgerReplaceLatest({
      equityAbsByDay,
      holdings: executed.holdings,
      cash: executed.cash,
      prices: { AAA: 2, BBB: 1 },
      warnings,
    });

    expect(executed.event.executionTiming).toBe("same_bar_close");
    expect(executed.event.signalDate).toBe("2026-01-02");
    expect(executed.turnoverNotional).toBeCloseTo(45.4545454545, 8);
    expect(executed.feeNotional).toBeCloseTo(4.5454545455, 8);
    expect(equityAbsByDay).toHaveLength(1);
    expect(equityAbsByDay[0]).toBeCloseTo(145.4545454545, 8);
  });
});
