import { describe, expect, it } from "vitest";

describe("/api/daa/auth/email-login/consume route v0", () => {
  it("returns explicit 410 after email-login deactivation", async () => {
    const mod = await import("../../../app/api/daa/auth/email-login/consume/route");
    const req = new Request(
      "https://example.com/api/daa/auth/email-login/consume?token=any&returnTo=" + encodeURIComponent("/daa/dashboard"),
      { method: "GET" },
    );

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(410);

    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("email_login_disabled");
  });
});
