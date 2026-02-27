import { describe, expect, it } from "vitest";

describe("/api/daa/auth/email-login/verify route v0", () => {
  it("returns explicit 410 after email-login deactivation", async () => {
    const mod = await import("../../../app/api/daa/auth/email-login/verify/route");
    const req = new Request("https://example.com/api/daa/auth/email-login/verify", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", code: "any", returnTo: "/daa/dashboard" }),
    });

    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(410);

    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("email_login_disabled");
  });
});
