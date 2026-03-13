import { describe, expect, it } from "vitest";

import { appendNoticeParam, normalizeDaaReturnTo } from "../url";

describe("daa/url", () => {
  it("adds notice to a plain path", () => {
    expect(appendNoticeParam("/daa/dashboard", "signed_in")).toBe("/daa/dashboard?notice=signed_in");
  });

  it("preserves existing query params", () => {
    expect(appendNoticeParam("/daa/dashboard?source=login", "signed_in")).toBe("/daa/dashboard?source=login&notice=signed_in");
  });

  it("preserves hash", () => {
    expect(appendNoticeParam("/daa/dashboard?source=login#ops", "signed_in")).toBe("/daa/dashboard?source=login&notice=signed_in#ops");
  });

  it("overwrites an existing notice", () => {
    expect(appendNoticeParam("/daa/dashboard?notice=old", "signed_in")).toBe("/daa/dashboard?notice=signed_in");
  });

  describe("normalizeDaaReturnTo", () => {
    it("空值或不安全路径统一回落到资产首页", () => {
      expect(normalizeDaaReturnTo("")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("https://evil.com")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("//evil.com/daa/dashboard")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("not-a-path")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("/not-daa")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("/daa/login?returnTo=%2Fdaa%2Fdashboard")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("/daa/wizard")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("/daa/step/5")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("/daa/market/funds")).toBe("/daa/dashboard");
    });

    it("canonicalizes /daa/dashboard and strips legacy tab", () => {
      expect(normalizeDaaReturnTo("/daa")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("/daa/dashboard/")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnTo("/daa/dashboard?tab=unknown#x")).toBe("/daa/dashboard#x");
      expect(normalizeDaaReturnTo("/daa/dashboard?tab=settings&section=security#x")).toBe("/daa/dashboard?section=security#x");
    });

    it("preserves dashboard deep links", () => {
      expect(normalizeDaaReturnTo("/daa/dashboard/workbench")).toBe("/daa/dashboard/workbench");
      expect(normalizeDaaReturnTo("/daa/dashboard/strategy-lab?from=login#run")).toBe("/daa/dashboard/strategy-lab?from=login#run");
      expect(normalizeDaaReturnTo("/daa/dashboard/settings?section=risk")).toBe("/daa/dashboard/settings?section=risk");
    });
  });
});
