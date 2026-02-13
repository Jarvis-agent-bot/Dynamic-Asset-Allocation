import { describe, expect, it } from "vitest";

import { addDaysIsoUtc, normalizeYfinanceHistoricalQuotes, normalizeYfinanceSymbol } from "./yfinance";

describe("market/yfinance", () => {
  it("normalizeYfinanceSymbol() uppercases and maps 4-digit HK tickers", () => {
    expect(normalizeYfinanceSymbol("spy")).toBe("SPY");
    expect(normalizeYfinanceSymbol(" 2800 ")).toBe("2800.HK");
    expect(normalizeYfinanceSymbol("0700")).toBe("0700.HK");
    expect(normalizeYfinanceSymbol("0700.hk")).toBe("0700.HK");
  });

  it("addDaysIsoUtc() adds days in UTC", () => {
    expect(addDaysIsoUtc("2026-02-01", 1)).toBe("2026-02-02");
  });

  it("normalizeYfinanceHistoricalQuotes() de-dupes, sorts, and filters to range", () => {
    const rows = [
      { date: new Date("2026-02-01T00:00:00.000Z"), close: 101 },
      { date: new Date("2026-01-30T00:00:00.000Z"), close: 99 },
      // Duplicate date: keep first-seen.
      { date: new Date("2026-01-30T00:00:00.000Z"), close: 999 },
      { date: "2026-01-31", close: 100 },
    ];

    const r = normalizeYfinanceHistoricalQuotes(rows, { start: "2026-01-31", end: "2026-02-01" });
    expect(r.series).toEqual([
      { date: "2026-01-31", close: 100 },
      { date: "2026-02-01", close: 101 },
    ]);
  });
});
