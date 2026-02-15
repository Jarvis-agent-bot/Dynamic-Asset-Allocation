import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { sendEmailV0 } from "../sendEmailV0";

describe("daa/email sendEmailV0", () => {
  const oldEnv = process.env;
  const oldFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...oldEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.DAA_AUTH_EMAIL_FROM;

    // Default stub; tests override as needed.
    globalThis.fetch = vi.fn(async () => ({ ok: true } as any)) as any;
  });

  afterEach(() => {
    process.env = oldEnv;
    globalThis.fetch = oldFetch;
  });

  it("skips when RESEND_API_KEY is missing", async () => {
    process.env.DAA_AUTH_EMAIL_FROM = "admin@example.com";

    const r = await sendEmailV0({ to: "a@b.com", subject: "s", text: "t" });
    expect(r).toEqual({ ok: false, skipped: true, error: "missing RESEND_API_KEY" });
  });

  it("skips when DAA_AUTH_EMAIL_FROM is missing", async () => {
    process.env.RESEND_API_KEY = "rk_x";

    const r = await sendEmailV0({ to: "a@b.com", subject: "s", text: "t" });
    expect(r).toEqual({ ok: false, skipped: true, error: "missing DAA_AUTH_EMAIL_FROM" });
  });

  it("validates required args", async () => {
    process.env.RESEND_API_KEY = "rk_x";
    process.env.DAA_AUTH_EMAIL_FROM = "admin@example.com";

    await expect(sendEmailV0({ to: "", subject: "s", text: "t" })).resolves.toEqual({ ok: false, skipped: true, error: "missing to" });
    await expect(sendEmailV0({ to: "a@b.com", subject: "", text: "t" })).resolves.toEqual({ ok: false, skipped: true, error: "missing subject" });
    await expect(sendEmailV0({ to: "a@b.com", subject: "s", text: "" })).resolves.toEqual({ ok: false, skipped: true, error: "missing text" });
  });

  it("returns HTTP error details when Resend returns non-2xx", async () => {
    process.env.RESEND_API_KEY = "rk_x";
    process.env.DAA_AUTH_EMAIL_FROM = "admin@example.com";

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => "bad request"
    } as any)) as any;

    const r = await sendEmailV0({ to: "a@b.com", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.skipped).toBe(false);
      expect(r.error).toContain("HTTP 400");
      expect(r.error).toContain("bad request");
    }
  });

  it("posts to Resend with expected payload", async () => {
    process.env.RESEND_API_KEY = "rk_x";
    process.env.DAA_AUTH_EMAIL_FROM = "admin@example.com";

    const fetchMock = vi.fn(async () => ({ ok: true } as any));
    globalThis.fetch = fetchMock as any;

    const r = await sendEmailV0({ to: "a@b.com", subject: "s", text: "t" });
    expect(r).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect(init?.headers?.authorization).toBe("Bearer rk_x");

    const body = JSON.parse(init.body);
    expect(body).toEqual({ from: "admin@example.com", to: "a@b.com", subject: "s", text: "t" });
  });
});
