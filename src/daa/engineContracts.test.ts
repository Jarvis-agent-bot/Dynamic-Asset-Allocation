import { describe, expect, it } from "vitest";

import { isRebalanceSimulateRequest } from "./engineContracts";

describe("isRebalanceSimulateRequest", () => {
  it("accepts objects with money_plan and signals", () => {
    expect(isRebalanceSimulateRequest({ money_plan: null, signals: [] })).toBe(true);
    expect(isRebalanceSimulateRequest({ money_plan: { a: 1 }, signals: { b: 2 } })).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isRebalanceSimulateRequest(null)).toBe(false);
    expect(isRebalanceSimulateRequest("x")).toBe(false);
    expect(isRebalanceSimulateRequest(123)).toBe(false);
  });

  it("rejects objects missing required keys", () => {
    expect(isRebalanceSimulateRequest({})).toBe(false);
    expect(isRebalanceSimulateRequest({ money_plan: 1 })).toBe(false);
    expect(isRebalanceSimulateRequest({ signals: 1 })).toBe(false);
  });
});
