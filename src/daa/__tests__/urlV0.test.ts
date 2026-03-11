import { describe, expect, it } from "vitest";

import { appendNoticeParamV0, normalizeDaaReturnToV0 } from "../urlV0";

describe("daa/urlV0", () => {
  it("adds notice to a plain path", () => {
    expect(appendNoticeParamV0("/daa/dashboard", "signed_in")).toBe("/daa/dashboard?notice=signed_in");
  });

  it("preserves existing query params", () => {
    expect(appendNoticeParamV0("/daa/dashboard?source=login", "signed_in")).toBe("/daa/dashboard?source=login&notice=signed_in");
  });

  it("preserves hash", () => {
    expect(appendNoticeParamV0("/daa/dashboard?source=login#ops", "signed_in")).toBe("/daa/dashboard?source=login&notice=signed_in#ops");
  });

  it("overwrites an existing notice", () => {
    expect(appendNoticeParamV0("/daa/dashboard?notice=old", "signed_in")).toBe("/daa/dashboard?notice=signed_in");
  });

  describe("normalizeDaaReturnToV0", () => {
    it("空值或不安全路径统一回落到资产首页", () => {
      expect(normalizeDaaReturnToV0("")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("https://evil.com")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("//evil.com/daa/dashboard")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("not-a-path")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/not-daa")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/daa/login?returnTo=%2Fdaa%2Fdashboard")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/daa/wizard")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/daa/step/5")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/daa/market/funds")).toBe("/daa/dashboard");
    });

    it("canonicalizes /daa/dashboard and strips legacy tab", () => {
      expect(normalizeDaaReturnToV0("/daa")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/daa/dashboard/")).toBe("/daa/dashboard");
      expect(normalizeDaaReturnToV0("/daa/dashboard?tab=unknown#x")).toBe("/daa/dashboard#x");
      expect(normalizeDaaReturnToV0("/daa/dashboard?tab=settings&section=security#x")).toBe("/daa/dashboard?section=security#x");
    });

    it("preserves dashboard deep links", () => {
      expect(normalizeDaaReturnToV0("/daa/dashboard/workbench")).toBe("/daa/dashboard/workbench");
      expect(normalizeDaaReturnToV0("/daa/dashboard/strategy-lab?from=login#run")).toBe("/daa/dashboard/strategy-lab?from=login#run");
      expect(normalizeDaaReturnToV0("/daa/dashboard/settings?section=risk")).toBe("/daa/dashboard/settings?section=risk");
    });
  });
});
