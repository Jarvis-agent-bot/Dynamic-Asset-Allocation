import { describe, expect, it } from "vitest";
import { assertValidPriceSeries } from "../seriesContracts";
import type { PriceBar } from "../domain";

function bar(date: string, close: number): PriceBar {
  return { date, close };
}

describe("seriesContracts", () => {
  describe("assertValidPriceSeries", () => {
    it("accepts a minimal valid 2-point series", () => {
      expect(() => assertValidPriceSeries([bar("2026-02-01", 100), bar("2026-02-02", 101)])).not.toThrow();
    });

    it("throws on series shorter than 2", () => {
      expect(() => assertValidPriceSeries([bar("2026-02-01", 100)])).toThrow(/series too short/i);
    });

    it("throws on non-finite close", () => {
      expect(() => assertValidPriceSeries([bar("2026-02-01", 100), bar("2026-02-02", Number.NaN)])).toThrow(
        /close must be a finite number/i,
      );
    });

    it("throws on non-positive close", () => {
      expect(() => assertValidPriceSeries([bar("2026-02-01", 100), bar("2026-02-02", 0)])).toThrow(
        /close must be > 0/i,
      );
    });
  });
});
