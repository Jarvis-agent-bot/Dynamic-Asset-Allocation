import { describe, expect, it } from "vitest";

import { appendNoticeParamV0 } from "../urlV0";

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
});
