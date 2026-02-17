import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postEmailLoginLinkV0 } from "../../../../app/api/daa/auth/email-login/_lib/emailLoginRequestHandlerV0";

const mocks = vi.hoisted(() => ({
  createToken: vi.fn(),
  findLastCreatedAt: vi.fn(),
  getIp: vi.fn(),
  getUa: vi.fn(),
  appendAudit: vi.fn(),
  getAccountByUsername: vi.fn(),
  sendEmail: vi.fn(),
  normalizeReturnTo: vi.fn(),
}));

vi.mock("@/src/daa/auth/daaAuthEmailLoginStoreV0", () => ({
  createDaaAuthEmailLoginTokenV0: mocks.createToken,
  findLastDaaAuthEmailLoginTokenCreatedAtV0: mocks.findLastCreatedAt,
}));

vi.mock("@/src/daa/auth/daaAuthRequestV0", () => ({
  getClientIpFromRequestV0: mocks.getIp,
  getUserAgentFromRequestV0: mocks.getUa,
}));

vi.mock("@/src/daa/auth/daaAuthStoreV0", () => ({
  appendDaaAuthAuditEventV0: mocks.appendAudit,
  getDaaAuthAccountByUsernameV0: mocks.getAccountByUsername,
}));

vi.mock("@/src/daa/email/sendEmailV0", () => ({
  sendEmailV0: mocks.sendEmail,
}));

vi.mock("@/src/daa/urlV0", () => ({
  normalizeDaaReturnToV0: mocks.normalizeReturnTo,
}));

describe("postEmailLoginLinkV0", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLastCreatedAt.mockResolvedValue(null);
    mocks.getIp.mockReturnValue("127.0.0.1");
    mocks.getUa.mockReturnValue("vitest");
    mocks.normalizeReturnTo.mockReturnValue("/daa/dashboard");
    mocks.getAccountByUsername.mockResolvedValue({
      accountId: "acc_1",
      username: "trader@example.com",
      status: "active",
    });
    mocks.createToken.mockResolvedValue({ token: "123456" });
    mocks.sendEmail.mockResolvedValue({ ok: true });
    mocks.appendAudit.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete process.env.DAA_EMAIL_LOGIN_DEBUG;
  });

  it("sends verification email through sendEmailV0 for valid account", async () => {
    const req = new Request("http://localhost/api/daa/auth/email-login/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "trader@example.com", returnTo: "/daa/dashboard" }),
    });

    const res = await postEmailLoginLinkV0(req, { mode: "request" });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.cooldownSeconds).toBe(30);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "trader@example.com",
        subject: "Your DAA verification code",
      })
    );
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "auth.email_otp.sent",
        payload: expect.objectContaining({ provider: "resend", deliveryOk: true }),
      })
    );
  });

  it("returns ok without email delivery when account does not exist", async () => {
    mocks.getAccountByUsername.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/daa/auth/email-login/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "missing@example.com", returnTo: "/daa/dashboard" }),
    });

    const res = await postEmailLoginLinkV0(req, { mode: "request" });
    const body = await res.json();

    expect(body).toEqual({ ok: true, cooldownSeconds: 30 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("includes delivery status in debug mode when Resend call is skipped", async () => {
    process.env.DAA_EMAIL_LOGIN_DEBUG = "1";
    mocks.sendEmail.mockResolvedValueOnce({ ok: false, skipped: true, error: "missing RESEND_API_KEY" });

    const req = new Request("http://localhost/api/daa/auth/email-login/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "trader@example.com", returnTo: "/daa/dashboard" }),
    });

    const res = await postEmailLoginLinkV0(req, { mode: "request" });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.debugCode).toBe("123456");
    expect(body.delivery).toEqual({ ok: false, skipped: true, error: "missing RESEND_API_KEY" });
  });
});
