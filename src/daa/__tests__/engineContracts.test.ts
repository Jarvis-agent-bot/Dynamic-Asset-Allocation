import { describe, expect, it } from "vitest";

import { isEngineErrorResponse, isPlainObject, isRebalanceSimulateRequest } from "../engineContracts";

describe("daa/engineContracts", () => {
  it("isPlainObject", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("isEngineErrorResponse", () => {
    expect(isEngineErrorResponse(null)).toBe(false);
    expect(isEngineErrorResponse({})).toBe(false);
    expect(isEngineErrorResponse({ error: 123 })).toBe(false);

    expect(isEngineErrorResponse({ error: "upstream fetch failed" })).toBe(true);
    expect(isEngineErrorResponse({ error: "bad", message: "x" })).toBe(true);
    expect(isEngineErrorResponse({ error: "bad", upstream: "http://x" })).toBe(true);

    expect(isEngineErrorResponse({ error: "bad", message: 1 })).toBe(false);
    expect(isEngineErrorResponse({ error: "bad", upstream: 1 })).toBe(false);
  });

  it("isRebalanceSimulateRequest", () => {
    expect(isRebalanceSimulateRequest(null)).toBe(false);
    expect(isRebalanceSimulateRequest({})).toBe(false);
    expect(isRebalanceSimulateRequest({ money_plan: {}, signals: [] })).toBe(true);
  });
});
