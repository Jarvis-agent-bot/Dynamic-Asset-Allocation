/**
 * Feishu (Lark) webhook notification.
 *
 * To use: create a custom bot in a Feishu group chat and get the webhook URL.
 * The webhook URL looks like: https://open.feishu.cn/open-apis/bot/v2/hook/<token>
 *
 * Configure via Settings → Credentials UI, or set env var:
 *   FEISHU_WEBHOOK_URL or DAA_FEISHU_WEBHOOK_URL
 */

import { resolveSecret } from "@/src/daa/config/secretsManager";

export async function sendFeishuMessage(opts: {
  webhookUrl: string;
  text: string;
}): Promise<boolean> {
  const webhookUrl = String(opts.webhookUrl || "").trim();
  const text = String(opts.text || "").trim();
  if (!webhookUrl || !text) return false;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text },
      }),
      cache: "no-store",
    });

    if (!response.ok) return false;
    const data = (await response.json().catch(() => ({}))) as { code?: number };
    return data.code === 0;
  } catch {
    return false;
  }
}

export async function sendFeishuRichMessage(opts: {
  webhookUrl: string;
  title: string;
  content: Array<Array<{ tag: "text"; text: string } | { tag: "a"; text: string; href: string }>>;
}): Promise<boolean> {
  const webhookUrl = String(opts.webhookUrl || "").trim();
  if (!webhookUrl || !opts.title) return false;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg_type: "post",
        content: {
          post: {
            zh_cn: {
              title: opts.title,
              content: opts.content,
            },
          },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) return false;
    const data = (await response.json().catch(() => ({}))) as { code?: number };
    return data.code === 0;
  } catch {
    return false;
  }
}

export async function sendFeishuByEnv(message: string): Promise<boolean> {
  const webhookUrl = await resolveSecret("feishu_webhook_url");
  if (!webhookUrl) return false;
  return sendFeishuMessage({ webhookUrl, text: message });
}
