import { describe, expect, it } from "vitest";

import { normalizeOkxCandlesPayload } from "./okx";

describe("normalizeOkxCandlesPayload", () => {
  it("sorts ascending, de-dupes by date, and filters by range", () => {
    // OKX candles rows: [ts, o, h, l, c, ...]
    const payload = {
      data: [
        ["1765324800000", "100", "110", "90", "105", "0", "0", "0", "1"], // 2025-12-10
        ["1765238400000", "90", "100", "80", "95", "0", "0", "0", "1"], // 2025-12-09
        // Duplicate same day (should keep first seen - newest-first semantics)
        ["1765238400000", "90", "100", "80", "96", "0", "0", "0", "1"],
      ],
    };

    const r = normalizeOkxCandlesPayload(payload, { start: "2025-12-09", end: "2025-12-10" });
    expect(r.series).toEqual([
      { date: "2025-12-09", close: 95 },
      { date: "2025-12-10", close: 105 },
    ]);
  });

  it("reports issues and skips invalid rows", () => {
    const payload = {
      data: [["not-a-ts", "0", "0", "0", "100"], ["1765238400000", "0", "0", "0", "-1"]],
    };

    const r = normalizeOkxCandlesPayload(payload);
    expect(r.series).toEqual([]);
    expect(r.issues.join("\n")).toMatch(/invalid timestamp/i);
    expect(r.issues.join("\n")).toMatch(/invalid close/i);
  });
});
