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

describe("/api/daa/auth/email-login/verify route v0", () => {
  it("accepts a valid one-time email code and sets a session cookie", async () => {
    resetPgMem();

    const account = await createDaaAuthAccountV0({ username: "otp-user@example.com", password: "pw-1", roles: ["viewer"] });
    const { token } = await createDaaAuthEmailLoginTokenV0({ accountId: account.accountId, ttlMinutes: 15, userAgent: "ua", ip: "1.2.3.4" });

    const mod = await import("../../../app/api/daa/auth/email-login/verify/route");
    const req = new Request("https://example.com/api/daa/auth/email-login/verify", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: account.username, code: token, returnTo: "/daa/step/4" }),
    });

    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(String(payload.redirectTo || "")).toContain("/daa/dashboard");

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${DAA_AUTH_SESSION_COOKIE_V0}=`);
  });

  it("rejects a code/email mismatch", async () => {
    resetPgMem();

    const a1 = await createDaaAuthAccountV0({ username: "a1@example.com", password: "pw-1", roles: ["viewer"] });
    const a2 = await createDaaAuthAccountV0({ username: "a2@example.com", password: "pw-2", roles: ["viewer"] });
    const { token } = await createDaaAuthEmailLoginTokenV0({ accountId: a1.accountId, ttlMinutes: 15 });

    const mod = await import("../../../app/api/daa/auth/email-login/verify/route");
    const req = new Request("https://example.com/api/daa/auth/email-login/verify", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: a2.username, code: token, returnTo: "/daa/dashboard" }),
    });

    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(401);

    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("invalid code");
  });
});
