import { describe, expect, it } from "vitest";

import { getDaaDashboardCompatRedirect } from "../dashboardCompat";

function parseParams(url: string) {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : "");
}

describe("getDaaDashboardCompatRedirect", () => {
  it("redirects /daa/wizard to /daa/dashboard?tab=wizard&step=1", () => {
    expect(getDaaDashboardCompatRedirect("/daa/wizard", "")).toBe("/daa/dashboard?tab=wizard&step=1");
  });

  it("preserves other query params and normalizes step", () => {
    const u1 = getDaaDashboardCompatRedirect("/daa/wizard", "?step=3&foo=bar");
    expect(u1).not.toBeNull();
    expect(parseParams(u1!).get("step")).toBe("3");
    expect(parseParams(u1!).get("foo")).toBe("bar");

    const u2 = getDaaDashboardCompatRedirect("/daa/wizard", "?step=0&foo=bar");
    expect(u2).not.toBeNull();
    expect(parseParams(u2!).get("step")).toBe("1");
    expect(parseParams(u2!).get("foo")).toBe("bar");
  });

  it("supports /daa/wizard/step/:id path form", () => {
    expect(getDaaDashboardCompatRedirect("/daa/wizard/step/7", "")).toBe("/daa/dashboard?tab=wizard&step=7");

    const u = getDaaDashboardCompatRedirect("/daa/wizard/step/7/", "?foo=bar");
    expect(u).not.toBeNull();
    expect(parseParams(u!).get("step")).toBe("7");
    expect(parseParams(u!).get("foo")).toBe("bar");
  });

  it("redirects /daa?step=... to wizard tab", () => {
    expect(getDaaDashboardCompatRedirect("/daa", "?step=2")).toBe("/daa/dashboard?step=2&tab=wizard");
  });

  it("redirects /daa/step/:id to wizard tab", () => {
    expect(getDaaDashboardCompatRedirect("/daa/step/4", "")).toBe("/daa/dashboard?tab=wizard&step=4");
    expect(getDaaDashboardCompatRedirect("/daa/step/4/", "?foo=bar")).toBe("/daa/dashboard?foo=bar&tab=wizard&step=4");
  });

  it("redirects /daa/market/funds to market-funds tab", () => {
    expect(getDaaDashboardCompatRedirect("/daa/market/funds", "")).toBe("/daa/dashboard?tab=market-funds");
  });

  it("returns null for canonical /daa/dashboard", () => {
    expect(getDaaDashboardCompatRedirect("/daa/dashboard", "")).toBeNull();
  });
});
