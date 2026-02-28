import { describe, expect, it } from "vitest";

import { appendNoticeParamV0, normalizeDaaReturnToV0 } from "../urlV0";

describe("daa/urlV0", () => {
  it("adds notice to a plain path", () => {
    expect(appendNoticeParamV0("/daa/dashboard", "signed_in")).toBe("/daa/dashboard?notice=signed_in");
  });

  it("preserves existing query params", () => {
    expect(appendNoticeParamV0("/daa/dashboard?tab=unified-core", "signed_in")).toBe(
      "/daa/dashboard?tab=unified-core&notice=signed_in"
    );
  });

  it("preserves hash", () => {
    expect(appendNoticeParamV0("/daa/dashboard?tab=unified-core#ops", "signed_in")).toBe(
      "/daa/dashboard?tab=unified-core&notice=signed_in#ops"
    );
  });

  it("overwrites an existing notice", () => {
    expect(appendNoticeParamV0("/daa/dashboard?notice=old", "signed_in")).toBe("/daa/dashboard?notice=signed_in");
  });

  describe("normalizeDaaReturnToV0", () => {
    it("defaults to unified-core console for empty/unsafe values", () => {
      expect(normalizeDaaReturnToV0("")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("https://evil.com")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("//evil.com/daa/dashboard")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("not-a-path")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("/not-daa")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("/daa/login?returnTo=%2Fdaa%2Fdashboard")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("/daa/wizard")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("/daa/step/5")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("/daa/market/funds")).toBe("/daa/dashboard?tab=unified-core");
    });

    it("canonicalizes /daa/dashboard and preserves query/hash", () => {
      expect(normalizeDaaReturnToV0("/daa")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("/daa/dashboard/")).toBe("/daa/dashboard?tab=unified-core");
      expect(normalizeDaaReturnToV0("/daa/dashboard?tab=unknown#x")).toBe("/daa/dashboard?tab=unified-core#x");
    });

    it("保留 tab=settings 的统一入口，不接受旧 settings 路径", () => {
      expect(normalizeDaaReturnToV0("/daa/dashboard?tab=settings")).toBe("/daa/dashboard?tab=settings");
      expect(normalizeDaaReturnToV0("/daa/dashboard/settings")).toBe("/daa/dashboard?tab=unified-core");
    });
  });
});
