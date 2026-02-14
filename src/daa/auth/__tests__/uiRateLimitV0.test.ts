import { describe, expect, it } from "vitest";

import { formatRateLimitedMessageV0, parseRetryAfterSecondsV0 } from "../uiRateLimitV0";

describe("parseRetryAfterSecondsV0", () => {
  it("parses integer seconds", () => {
    expect(parseRetryAfterSecondsV0("120", 0)).toBe(120);
  });

  it("parses HTTP-date", () => {
    const nowMs = Date.UTC(2026, 1, 15, 0, 0, 0);
    const header = new Date(nowMs + 5000).toUTCString();
    expect(parseRetryAfterSecondsV0(header, nowMs)).toBe(5);
  });

  it("returns null for empty/invalid", () => {
    expect(parseRetryAfterSecondsV0(null, 0)).toBeNull();
    expect(parseRetryAfterSecondsV0("", 0)).toBeNull();
    expect(parseRetryAfterSecondsV0("not a date", 0)).toBeNull();
  });
});

describe("formatRateLimitedMessageV0", () => {
  it("includes seconds when small", () => {
    expect(formatRateLimitedMessageV0({ action: "send a sign-in link", retryAfterSeconds: 30 })).toContain("30s");
  });

  it("rounds up to minutes when large", () => {
    expect(formatRateLimitedMessageV0({ retryAfterSeconds: 90 })).toContain("about 2 minutes");
  });
});
