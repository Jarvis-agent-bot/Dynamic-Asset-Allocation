type SendEmailInput = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

type SendEmailResult = {
  sent: boolean;
  reason?: string;
  id?: string;
};

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function pickApiKeySync(): string {
  return normalizeText(process.env.RESEND_API_KEY || process.env.DAA_RESEND_API_KEY);
}

function pickFromAddressSync(): string {
  return normalizeText(process.env.DAA_EMAIL_FROM) || "DAA Bot <onboarding@resend.dev>";
}

async function pickApiKey(): Promise<string> {
  const envValue = pickApiKeySync();
  if (envValue) return envValue;
  try {
    const { resolveSecret } = await import("@/src/daa/config/secretsManager");
    return await resolveSecret("resend_api_key");
  } catch {
    return "";
  }
}

async function pickFromAddress(): Promise<string> {
  const envValue = pickFromAddressSync();
  if (envValue) return envValue;
  try {
    const { resolveSecret } = await import("@/src/daa/config/secretsManager");
    return (await resolveSecret("email_from")) || "DAA Bot <onboarding@resend.dev>";
  } catch {
    return "DAA Bot <onboarding@resend.dev>";
  }
}

export async function sendEmailByEnv(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = await pickApiKey();
  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY 未配置" };
  }

  const to = normalizeText(input.to);
  if (!to) {
    return { sent: false, reason: "收件地址为空" };
  }

  const subject = normalizeText(input.subject);
  if (!subject) {
    return { sent: false, reason: "主题为空" };
  }

  const payload = {
    from: await pickFromAddress(),
    to: [to],
    subject,
    text: normalizeText(input.text),
    html: normalizeText(input.html) || undefined,
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      sent: false,
      reason: `邮件发送失败(${response.status}): ${body.slice(0, 200)}`,
    };
  }

  const data = await response.json().catch(() => ({} as { id?: string }));
  return {
    sent: true,
    id: normalizeText((data as any)?.id),
  };
}
