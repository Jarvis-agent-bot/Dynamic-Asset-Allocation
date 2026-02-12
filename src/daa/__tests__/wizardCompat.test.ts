import { describe, expect, it } from "vitest";

import { getDaaWizardCompatRedirect } from "../wizardCompat";

function parseParams(url: string) {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : "");
}

describe("getDaaWizardCompatRedirect", () => {
  it("redirects /daa/wizard to /daa?step=1", () => {
    expect(getDaaWizardCompatRedirect("/daa/wizard", "")).toBe("/daa?step=1");
  });

  it("preserves other query params and normalizes step", () => {
    const u1 = getDaaWizardCompatRedirect("/daa/wizard", "?step=3&foo=bar");
    expect(u1).not.toBeNull();
    expect(parseParams(u1!).get("step")).toBe("3");
    expect(parseParams(u1!).get("foo")).toBe("bar");

    const u2 = getDaaWizardCompatRedirect("/daa/wizard", "?step=0&foo=bar");
    expect(u2).not.toBeNull();
    expect(parseParams(u2!).get("step")).toBe("1");
    expect(parseParams(u2!).get("foo")).toBe("bar");
  });

  it("supports /daa/wizard/step/:id path form", () => {
    expect(getDaaWizardCompatRedirect("/daa/wizard/step/7", "")).toBe("/daa?step=7");

    const u = getDaaWizardCompatRedirect("/daa/wizard/step/7/", "?foo=bar");
    expect(u).not.toBeNull();
    expect(parseParams(u!).get("step")).toBe("7");
    expect(parseParams(u!).get("foo")).toBe("bar");
  });

  it("returns null for unrelated paths", () => {
    expect(getDaaWizardCompatRedirect("/daa/dashboard", "")).toBeNull();
  });
});
