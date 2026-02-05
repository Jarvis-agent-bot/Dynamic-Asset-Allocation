import { describe, expect, it } from "vitest";

import { cumulativeProduct } from "../math";

describe("math", () => {
  it("cumulativeProduct is resilient to NaN/Infinity returns", () => {
    const eq = cumulativeProduct([0.1, Number.NaN, Number.POSITIVE_INFINITY, -0.5], 1);
    expect(eq[0]).toBeCloseTo(1.1);
    expect(eq[1]).toBeCloseTo(1.1);
    expect(eq[2]).toBeCloseTo(1.1);
    expect(eq[3]).toBeCloseTo(0.55);
  });
});
