import { describe, expect, it } from "vitest";

import { isDaaEngineRebalanceSimulateResponse } from "./daaEngine";

describe("isDaaEngineRebalanceSimulateResponse", () => {
  it("accepts empty object (loose v0)", () => {
    expect(isDaaEngineRebalanceSimulateResponse({})).toBe(true);
  });

  it("accepts valid shapes", () => {
    expect(isDaaEngineRebalanceSimulateResponse({ orders: [] })).toBe(true);
    expect(isDaaEngineRebalanceSimulateResponse({ explain: "ok" })).toBe(true);
    expect(isDaaEngineRebalanceSimulateResponse({ warnings: ["a", "b"] })).toBe(true);
    expect(isDaaEngineRebalanceSimulateResponse({ orders: [{ any: "thing" }], explain: "x", warnings: [] })).toBe(
      true,
    );
  });

  it("rejects non-objects and arrays", () => {
    expect(isDaaEngineRebalanceSimulateResponse(null)).toBe(false);
    expect(isDaaEngineRebalanceSimulateResponse([])).toBe(false);
    expect(isDaaEngineRebalanceSimulateResponse("x")).toBe(false);
    expect(isDaaEngineRebalanceSimulateResponse(123)).toBe(false);
  });

  it("rejects wrong field types when present", () => {
    expect(isDaaEngineRebalanceSimulateResponse({ orders: {} })).toBe(false);
    expect(isDaaEngineRebalanceSimulateResponse({ explain: 1 })).toBe(false);
    expect(isDaaEngineRebalanceSimulateResponse({ warnings: "x" })).toBe(false);
    expect(isDaaEngineRebalanceSimulateResponse({ warnings: ["x", 1] })).toBe(false);
  });
});
