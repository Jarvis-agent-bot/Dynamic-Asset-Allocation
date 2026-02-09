import { afterEach, describe, expect, it } from "vitest";

import { parsePositiveIntEnv } from "../env";

describe("parsePositiveIntEnv", () => {
  const NAME = "__TEST_POS_INT__";

  afterEach(() => {
    delete process.env[NAME];
  });

  it("falls back when unset", () => {
    expect(parsePositiveIntEnv(NAME, 123)).toBe(123);
  });

  it("accepts positive integers", () => {
    process.env[NAME] = "45";
    expect(parsePositiveIntEnv(NAME, 123)).toBe(45);
  });

  it("truncates finite numbers", () => {
    process.env[NAME] = "12.9";
    expect(parsePositiveIntEnv(NAME, 123)).toBe(12);
  });

  it("falls back on non-numbers", () => {
    process.env[NAME] = "abc";
    expect(parsePositiveIntEnv(NAME, 123)).toBe(123);
  });

  it("falls back on zero/negative", () => {
    process.env[NAME] = "0";
    expect(parsePositiveIntEnv(NAME, 123)).toBe(123);
    process.env[NAME] = "-1";
    expect(parsePositiveIntEnv(NAME, 123)).toBe(123);
  });
});
