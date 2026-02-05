import { describe, it, expect } from "vitest";

import { decideAction, computeConfidence } from "../signalDecision";
import { DEFAULT_SIGNAL_THRESHOLDS } from "../signalMapping";

describe("decideAction", () => {
  it("stays HOLD in the neutral band when delta is small", () => {
    const t = { ...DEFAULT_SIGNAL_THRESHOLDS, buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };
    expect(decideAction(0.5, 0.52, t)).toBe("HOLD");
    expect(decideAction(0.55, 0.56, t)).toBe("HOLD");
  });

  it("BUY when crossing above buyAbove", () => {
    const t = { ...DEFAULT_SIGNAL_THRESHOLDS, buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };
    expect(decideAction(0.59, 0.61, t)).toBe("BUY");
  });

  it("SELL when crossing below sellBelow", () => {
    const t = { ...DEFAULT_SIGNAL_THRESHOLDS, buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };
    expect(decideAction(0.41, 0.39, t)).toBe("SELL");
  });

  it("respects minChange as a momentum override", () => {
    const t = { ...DEFAULT_SIGNAL_THRESHOLDS, buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };
    expect(decideAction(0.2, 0.36, t)).toBe("BUY"); // +0.16
    expect(decideAction(0.8, 0.64, t)).toBe("SELL"); // -0.16
  });

  it("HOLD on non-finite weights (defensive)", () => {
    const t = { ...DEFAULT_SIGNAL_THRESHOLDS, buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };
    expect(decideAction(Number.NaN, 0.7, t)).toBe("HOLD");
    expect(decideAction(0.7, Number.NaN, t)).toBe("HOLD");
    expect(decideAction(Number.POSITIVE_INFINITY, 0.7, t)).toBe("HOLD");
    expect(decideAction(0.7, Number.NEGATIVE_INFINITY, t)).toBe("HOLD");
  });

  it("throws on invalid thresholds", () => {
    expect(() => decideAction(0.5, 0.5, { buyAbove: 0.4, sellBelow: 0.6, minChange: 0.1 })).toThrow(
      /sellBelow must be < buyAbove/
    );
    expect(() => decideAction(0.5, 0.5, { buyAbove: 0.5, sellBelow: 0.5, minChange: 0.1 })).toThrow(
      /sellBelow must be < buyAbove/
    );
    expect(() => decideAction(0.5, 0.5, { buyAbove: 1.2, sellBelow: 0.4, minChange: 0.1 })).toThrow(/buyAbove/);
    expect(() => decideAction(0.5, 0.5, { buyAbove: 0.6, sellBelow: 0.4, minChange: -0.1 })).toThrow(/minChange/);
  });
});

describe("computeConfidence", () => {
  it("returns 0 on non-finite inputs", () => {
    const t = { ...DEFAULT_SIGNAL_THRESHOLDS, buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };
    expect(computeConfidence("BUY", Number.NaN, 0.7, t)).toBe(0);
    expect(computeConfidence("SELL", 0.7, Number.POSITIVE_INFINITY, t)).toBe(0);
  });

  it("is higher for HOLD when target is safely inside the band and delta is small", () => {
    const t = { ...DEFAULT_SIGNAL_THRESHOLDS, buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };

    const midQuiet = computeConfidence("HOLD", 0.5, 0.5, t);
    const edgeQuiet = computeConfidence("HOLD", 0.5, 0.41, t);
    const midChoppy = computeConfidence("HOLD", 0.5, 0.62, t); // large-ish delta, and outside band

    expect(midQuiet).toBeGreaterThan(edgeQuiet);
    expect(midQuiet).toBeGreaterThan(midChoppy);
  });

  it("increases for BUY as target moves further above buyAbove", () => {
    const t = { ...DEFAULT_SIGNAL_THRESHOLDS, buyAbove: 0.6, sellBelow: 0.4, minChange: 0.15 };

    const near = computeConfidence("BUY", 0.59, 0.61, t);
    const far = computeConfidence("BUY", 0.59, 0.9, t);

    expect(far).toBeGreaterThan(near);
  });
});
