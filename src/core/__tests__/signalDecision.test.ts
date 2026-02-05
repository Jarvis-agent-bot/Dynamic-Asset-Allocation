import { describe, it, expect } from "vitest";

import { decideAction } from "../signalDecision";
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
});
