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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, skipped: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }

  return { ok: true };
}
