import { describe, expect, it } from "vitest";

import { computeHumanFactor } from "../humanFactor";

describe("humanFactor", () => {
  it("downweights sb score", () => {
    const r = computeHumanFactor({ id: "u1", name: "test", riskScore: "sb" });
    expect(r.weight).toBeGreaterThanOrEqual(0);
    expect(r.weight).toBeLessThan(0.5);
    expect(r.explain.join(" ")).toContain("sb");
  });

  it("clamps weight", () => {
    const r = computeHumanFactor({ id: "u1", name: "test" });
    expect(r.weight).toBeGreaterThanOrEqual(0);
    expect(r.weight).toBeLessThanOrEqual(1);
  });
});
