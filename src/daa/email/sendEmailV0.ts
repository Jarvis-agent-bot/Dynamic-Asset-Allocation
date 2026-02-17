type SendEmailArgsV0 = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmailV0(args: SendEmailArgsV0): Promise<{ ok: true } | { ok: false; skipped: boolean; error: string }> {
  const key = typeof process.env.RESEND_API_KEY === "string" ? process.env.RESEND_API_KEY.trim() : "";
  const from = typeof process.env.DAA_AUTH_EMAIL_FROM === "string" ? process.env.DAA_AUTH_EMAIL_FROM.trim() : "";

  if (!key || !from) {
    return {
      ok: false,
      skipped: true,
      error: !key ? "missing RESEND_API_KEY" : "missing DAA_AUTH_EMAIL_FROM",
    };
  }

  const to = String(args.to ?? "").trim();
  const subject = String(args.subject ?? "").trim();
  const text = String(args.text ?? "").trim();

  if (!to) return { ok: false, skipped: true, error: "missing to" };
  if (!subject) return { ok: false, skipped: true, error: "missing subject" };
  if (!text) return { ok: false, skipped: true, error: "missing text" };

  const timeoutMsRaw = Number(process.env.DAA_RESEND_TIMEOUT_MS ?? "8000");
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(10, Math.floor(timeoutMsRaw)) : 8000;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
      signal: ac.signal,
    });

    if (!res.ok) {
      // Keep provider errors low-detail to avoid leaking upstream response payloads.
      return { ok: false, skipped: false, error: `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return { ok: false, skipped: false, error: `timeout after ${timeoutMs}ms` };
    }
    return { ok: false, skipped: false, error: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
