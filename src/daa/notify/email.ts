import { resolveSecret } from "@/src/daa/config/secretsManager";

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

export async function sendEmailByEnv(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = await resolveSecret("resend_api_key");
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

  const fromAddress = (await resolveSecret("email_from")) || "DAA Bot <onboarding@resend.dev>";

  const payload = {
    from: fromAddress,
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
