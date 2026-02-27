import { describe, expect, it } from "vitest";

import { formatSessionRemainingV0, parseIsoToMsV0 } from "@/src/daa/settings/sessionFormatV0";

describe("settings session countdown helpers v0", () => {
  it("parses ISO timestamps into epoch milliseconds", () => {
    expect(parseIsoToMsV0("2026-02-27T12:00:00.000Z")).toBe(1772193600000);
    expect(parseIsoToMsV0("not-a-date")).toBe(null);
  });

  it("formats remaining session ttl for active sessions", () => {
    const now = 1_700_000_000_000;
    expect(formatSessionRemainingV0("2023-11-14T22:14:25.000Z", now)).toBe("1m 05s");
    expect(formatSessionRemainingV0("2023-11-14T23:15:00.000Z", now)).toBe("1h 01m");
  });

  it("returns expired/invalid labels for non-active sessions", () => {
    const now = 1_700_000_000_000;
    expect(formatSessionRemainingV0("2023-11-14T22:13:15.000Z", now)).toBe("expired");
    expect(formatSessionRemainingV0("oops", now)).toBe("-");
  });
});
