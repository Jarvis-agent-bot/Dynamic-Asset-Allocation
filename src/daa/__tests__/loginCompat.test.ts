import { describe, expect, it } from "vitest";

import { getDaaLoginAuthedRedirect } from "../loginCompat";

describe("getDaaLoginAuthedRedirect", () => {
  it("returns null when no session", () => {
    expect(getDaaLoginAuthedRedirect({ pathname: "/daa/login", search: "", hasSession: false })).toBeNull();
  });

  it("redirects /daa/login to /daa/dashboard when session exists", () => {
    expect(getDaaLoginAuthedRedirect({ pathname: "/daa/login", search: "", hasSession: true })).toBe("/daa/dashboard");
  });

  it("maps returnTo deep-links into canonical /daa/dashboard", () => {
    const u1 = getDaaLoginAuthedRedirect({ pathname: "/daa/login", search: "?returnTo=%2Fdaa%2Fstep%2F4", hasSession: true });
    expect(u1).toBe("/daa/dashboard?tab=wizard&step=4");

    const u2 = getDaaLoginAuthedRedirect({
      pathname: "/daa/login",
      search: "?returnTo=%2Fdaa%2Fdashboard%3Ftab%3Dmarket-funds",
      hasSession: true,
    });
    expect(u2).toBe("/daa/dashboard?tab=market-funds");

    const u3 = getDaaLoginAuthedRedirect({
      pathname: "/daa/login",
      search: "?returnTo=%2Fdaa%2Fdashboard%2Fsettings%3Fsection%3Dsecurity%23x",
      hasSession: true,
    });
    expect(u3).toBe("/daa/dashboard/settings?section=security#x");
  });

  it("ignores non-DAA returnTo values", () => {
    const u = getDaaLoginAuthedRedirect({ pathname: "/daa/login", search: "?returnTo=https%3A%2F%2Fevil.com", hasSession: true });
    expect(u).toBe("/daa/dashboard");
  });

  it("avoids looping back into /daa/login", () => {
    const u = getDaaLoginAuthedRedirect({ pathname: "/daa/login", search: "?returnTo=%2Fdaa%2Flogin%3Ffoo%3Dbar", hasSession: true });
    expect(u).toBe("/daa/dashboard");
  });
});
