import { describe, expect, it } from "vitest";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "../auth/daaAuthConstantsV0";
import { createDaaAuthEmailLoginTokenV0 } from "../auth/daaAuthEmailLoginStoreV0";
import { createDaaAuthAccountV0 } from "../auth/daaAuthStoreV0";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";

function resetPgMem() {
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

describe("/api/daa/auth/email-login/consume route v0", () => {
  it("sets session cookie and redirects into canonical /daa/dashboard", async () => {
    resetPgMem();

    const account = await createDaaAuthAccountV0({ username: "consume-user@example.com", password: "pw-1", roles: ["viewer"] });
    const { token } = await createDaaAuthEmailLoginTokenV0({ accountId: account.accountId, ttlMinutes: 15, userAgent: "ua", ip: "1.2.3.4" });

    const mod = await import("../../../app/api/daa/auth/email-login/consume/route");
    const req = new Request(
      "https://example.com/api/daa/auth/email-login/consume?token=" +
        encodeURIComponent(token) +
        "&returnTo=" +
        encodeURIComponent("/daa/step/4"),
      {
        method: "GET",
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile WeChat",
        },
      }
    );

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(302);

    const location = res.headers.get("location") || "";
    expect(location).toContain("/daa/dashboard");
    expect(location).toContain("notice=signed_in");

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${DAA_AUTH_SESSION_COOKIE_V0}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect((res.headers.get("cache-control") || "").toLowerCase()).toContain("no-store");
  });

  it("preserves explicit notice in returnTo and does not overwrite it", async () => {
    resetPgMem();

    const account = await createDaaAuthAccountV0({ username: "consume-notice@example.com", password: "pw-1", roles: ["viewer"] });
    const { token } = await createDaaAuthEmailLoginTokenV0({ accountId: account.accountId, ttlMinutes: 15, userAgent: "ua", ip: "1.2.3.4" });

    const mod = await import("../../../app/api/daa/auth/email-login/consume/route");
    const req = new Request(
      "https://example.com/api/daa/auth/email-login/consume?token=" +
        encodeURIComponent(token) +
        "&returnTo=" +
        encodeURIComponent("/daa/dashboard?notice=already_signed_in"),
      { method: "GET" }
    );

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(302);

    const location = res.headers.get("location") || "";
    expect(location).toContain("/daa/dashboard");
    expect(location).toContain("notice=already_signed_in");
    expect(location).not.toContain("notice=signed_in");
  });

  it("redirects invalid token back to /daa/login with an error", async () => {
    resetPgMem();

    const mod = await import("../../../app/api/daa/auth/email-login/consume/route");
    const req = new Request(
      "https://example.com/api/daa/auth/email-login/consume?token=bad-token&returnTo=" + encodeURIComponent("/daa/dashboard"),
      { method: "GET" }
    );

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(302);

    const location = res.headers.get("location") || "";
    expect(location).toContain("/daa/login");
    expect(location).toContain("error=email-link-invalid");
    expect(location).toContain("returnTo=%2Fdaa%2Fdashboard");
    expect((res.headers.get("cache-control") || "").toLowerCase()).toContain("no-store");

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${DAA_AUTH_SESSION_COOKIE_V0}=`);
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });
});
