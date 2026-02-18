type SendEmailArgsV0 = {
  to: string;
  subject: string;
  text: string;
};

type SendEmailOkV0 = {
  ok: true;
  providerMessageId: string;
};

type SendEmailErrV0 = {
  ok: false;
  skipped: boolean;
  error: string;
};

function looksLikeEmailV0(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return Boolean(domain && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith("."));
}

function hasHeaderBreakV0(value: string): boolean {
  return value.includes("\n") || value.includes("\r");
}

export async function sendEmailV0(args: SendEmailArgsV0): Promise<SendEmailOkV0 | SendEmailErrV0> {
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
  if (!looksLikeEmailV0(from)) return { ok: false, skipped: true, error: "invalid DAA_AUTH_EMAIL_FROM" };
  if (!looksLikeEmailV0(to)) return { ok: false, skipped: true, error: "invalid to" };
  if (hasHeaderBreakV0(from) || hasHeaderBreakV0(to) || hasHeaderBreakV0(subject)) {
    return { ok: false, skipped: true, error: "invalid header characters" };
  }

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

    const payload = await res.json().catch(() => null);
    const providerMessageId = typeof payload?.id === "string" ? payload.id.trim() : "";
    if (!providerMessageId) {
      return { ok: false, skipped: false, error: "invalid provider response" };
    }

    return { ok: true, providerMessageId };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return { ok: false, skipped: false, error: `timeout after ${timeoutMs}ms` };
    }
    return { ok: false, skipped: false, error: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
