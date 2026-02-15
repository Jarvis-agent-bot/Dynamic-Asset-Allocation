import { describe, expect, it } from "vitest";

import { appendNoticeParamV0, normalizeDaaReturnToV0 } from "../urlV0";

describe("daa/urlV0", () => {
  it("adds notice to a plain path", () => {
    expect(appendNoticeParamV0("/daa/dashboard", "signed_in")).toBe("/daa/dashboard?notice=signed_in");
  });

  it("preserves existing query params", () => {
    expect(appendNoticeParamV0("/daa/dashboard?tab=wizard&step=1", "signed_in")).toBe(
      "/daa/dashboard?tab=wizard&step=1&notice=signed_in"
    );
  });

  it("preserves hash", () => {
    expect(appendNoticeParamV0("/daa/dashboard?tab=wizard#step5", "signed_in")).toBe(
      "/daa/dashboard?tab=wizard&notice=signed_in#step5"
    );
  });

  it("overwrites an existing notice", () => {
    expect(appendNoticeParamV0("/daa/dashboard?notice=old", "signed_in")).toBe("/daa/dashboard?notice=signed_in");
  });

  describe("normalizeDaaReturnToV0", () => {
    it("defaults to /daa/dashboard for empty/unsafe values", () => {
      expect(normalizeDaaReturnToV0("")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("https://evil.com")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("//evil.com/daa/dashboard")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("not-a-path")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/not-daa")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/daa/login?returnTo=%2Fdaa%2Fdashboard")).toBe("/daa/dashboard");
    });

    it("maps legacy /daa* routes into the canonical /daa/dashboard", () => {
      expect(normalizeDaaReturnToV0("/daa/step/5")).toBe("/daa/dashboard?tab=wizard&step=5");
      expect(normalizeDaaReturnToV0("/daa?step=4")).toBe("/daa/dashboard?step=4&tab=wizard");
      expect(normalizeDaaReturnToV0("/daa/market/funds")).toBe("/daa/dashboard?tab=market-funds");
    });

    it("canonicalizes /daa/dashboard and preserves query/hash", () => {
      expect(normalizeDaaReturnToV0("/daa/dashboard/")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/daa/dashboard?tab=wizard&step=1#x")).toBe("/daa/dashboard?tab=wizard&step=1#x");
      expect(normalizeDaaReturnToV0("/daa/step/2#foo")).toBe("/daa/dashboard?tab=wizard&step=2#foo");
    });
  });
});
