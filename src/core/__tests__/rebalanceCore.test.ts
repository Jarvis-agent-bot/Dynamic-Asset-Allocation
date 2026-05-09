import { describe, it, expect } from "vitest";

import { rebalanceCore } from "../rebalanceCore";

describe("rebalanceCore", () => {
  it("generates sell-then-buy orders to move toward target weights", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: [{ symbol: "AAA", qty: 10 }],
      prices: { AAA: 10, BBB: 10 },
      targetWeights: {
        AAA: 0,
        BBB: 1,
      },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
    });

    expect(res.explain.equity).toBe(100);
    expect(res.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["SELL:AAA:100", "BUY:BBB:100"]);

    // Engine should surface final targetWeights as an array for UI convenience.
    expect(res.targetWeights.map((w) => `${w.id}:${w.targetPct}`)).toEqual(["BBB:1", "AAA:0"]);
  });

  it("normalizes target weights when the sum exceeds 1", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: { AAA: 10 },
      prices: { AAA: 10, BBB: 10 },
      targetWeights: {
        AAA: 0.8,
        BBB: 0.8,
      },
    });

    // 10*10 => equity=100; after normalization, both become 0.5.
    const w = Object.fromEntries(res.targetWeights.map((x) => [x.id, x.targetPct]));
    expect(w.AAA).toBeCloseTo(0.5, 8);
    expect(w.BBB).toBeCloseTo(0.5, 8);
    expect(res.explain.notes.join("\n")).toMatch(/normalized/);
  });

  it("applies maxPositionPct and leaves remainder as implicit cash", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: { AAA: 10 },
      prices: { AAA: 10, BBB: 10 },
      targetWeights: { AAA: 0.9, BBB: 0.1 },
      constraints: { maxPositionPct: 0.5 },
    });

    const w = Object.fromEntries(res.targetWeights.map((x) => [x.id, x.targetPct]));
    expect(w.AAA).toBeCloseTo(0.5, 8);
    expect(w.BBB).toBeCloseTo(0.1, 8);

    expect(res.explain.notes.join("\n")).toMatch(/implicit cash/);
  });

  it("respects per-order maxIn/maxOut caps", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: [{ symbol: "AAA", qty: 10 }],
      prices: { AAA: 10, BBB: 10 },
      targetWeights: { AAA: 0, BBB: 1 },
      constraints: { maxOut: 30, maxIn: 40 },
    });

    // Sell is capped at 30, which funds only 30 of buys (also <= maxIn).
    expect(res.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["SELL:AAA:30", "BUY:BBB:30"]);
    expect(res.explain.cashEnd).toBe(0);
  });

  it("warns and skips valuation when prices are missing", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: [{ symbol: "AAA", qty: 10 }],
      prices: { BBB: 10 },
      targetWeights: { AAA: 0, BBB: 1 },
    });

    expect(res.explain.equity).toBe(0);
    expect(res.orders).toEqual([]);
    expect(res.warnings.join("\n")).toMatch(/missing price for holding AAA/i);
  });

  it("does not trigger when max drift is below driftThresholdPct", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: { AAA: 50, BBB: 50 },
      prices: { AAA: 1, BBB: 1 },
      targetWeights: { AAA: 0.51, BBB: 0.49 },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      trigger: { driftThresholdPct: 0.02 },
    });

    expect(res.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["SELL:BBB:1", "BUY:AAA:1"]);
    expect(res.trigger.shouldRebalance).toBe(false);
    expect(res.trigger.reasons.join("\n")).toMatch(/threshold:/);
  });

  it("uses minOrderNotional to filter out tiny drift trades", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: { AAA: 50, BBB: 50 },
      prices: { AAA: 1, BBB: 1 },
      targetWeights: { AAA: 0.51, BBB: 0.49 },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      trigger: { driftThresholdPct: 0, minOrderNotional: 5 },
    });

    expect(res.orders).toEqual([]);
    expect(res.trigger.shouldRebalance).toBe(false);
    expect(res.trigger.reasons.join("\n")).toMatch(/minOrderNotional:/);
    expect(res.warnings.join("\n")).toMatch(/blocks all trades/i);
  });

  it("respects minRebalanceIntervalSeconds when lastRebalanceAt is recent", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: { AAA: 100 },
      prices: { AAA: 1, BBB: 1 },
      targetWeights: { AAA: 0, BBB: 1 },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      trigger: {
        driftThresholdPct: 0,
        minOrderNotional: 0,
        minRebalanceIntervalSeconds: 3600,
        lastRebalanceAt: "2026-02-12T00:00:00.000Z",
        now: "2026-02-12T00:10:00.000Z",
      },
    });

    expect(res.orders.length).toBe(2);
    expect(res.trigger.shouldRebalance).toBe(false);
    expect(res.trigger.reasons.join("\n")).toMatch(/min_interval:/);
  });

  it("sweeps excess cash down toward implicit cash buffer when enabled", () => {
    const res = rebalanceCore({
      account: { cash: 1000 },
      holdings: {},
      prices: { AAA: 1, BBB: 1 },
      targetWeights: { AAA: 0.5, BBB: 0.4 }, // 10% implicit cash buffer
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      trigger: { driftThresholdPct: 0, minOrderNotional: 150, cashSweepToTarget: true },
    });

    // Without the sweep pass, lot rounding leaves cashEnd=250; sweep should invest the extra 150.
    expect(res.explain.cashEnd).toBe(100);
    expect(res.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["BUY:AAA:450", "BUY:BBB:300", "BUY:BBB:150"]);
    expect(res.explain.notes.join("\n")).toMatch(/cash sweep:/i);
  });

  it("surfaces min order size rounding as warnings (skip remainder)", () => {
    const res = rebalanceCore({
      account: { cash: 0 },
      holdings: { AAA: 27 },
      prices: { AAA: 10, BBB: 10 },
      targetWeights: { AAA: 0, BBB: 1 },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      trigger: { driftThresholdPct: 0, minOrderNotional: 100 },
    });

    // 27*10=270; with minOrderNotional=100 (lot step), we can only sell/buy 200 and skip the 70 remainder.
    expect(res.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["SELL:AAA:200", "BUY:BBB:200"]);
    expect(res.warnings.join("\n")).toMatch(/min order size:/i);
    expect(res.warnings.join("\n")).toMatch(/SELL AAA/i);
    expect(res.warnings.join("\n")).toMatch(/skipped 70\.00/i);
    expect(res.explain.notes.join("\n")).toMatch(/min order size:/i);
  });
});
