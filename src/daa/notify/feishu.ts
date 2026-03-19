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
import { appendNotificationDeliveryLog } from "@/src/daa/store/notificationDeliveryLogRepo";

export type FeishuSendResult = {
  ok: boolean;
  statusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  recipientHint: string | null;
  responseJson: Record<string, unknown> | null;
};

function toJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function sendFeishuMessage(opts: {
  webhookUrl: string;
  text: string;
}): Promise<FeishuSendResult> {
  const webhookUrl = String(opts.webhookUrl || "").trim();
  const text = String(opts.text || "").trim();
  if (!webhookUrl || !text) {
    return {
      ok: false,
      statusCode: null,
      errorCode: "MISSING_INPUT",
      errorMessage: "webhook / text 缺失",
      recipientHint: webhookUrl ? "webhook" : null,
      responseJson: null,
    };
  }

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
    const data = (await response.json().catch(() => null)) as { code?: number; msg?: string } | null;
    const responseJson = toJsonObject(data);
    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        errorCode: responseJson && typeof responseJson.code === "number" ? String(responseJson.code) : `HTTP_${response.status}`,
        errorMessage: responseJson && typeof responseJson.msg === "string" ? responseJson.msg : `HTTP ${response.status}`,
        recipientHint: "webhook",
        responseJson,
      };
    }
    const ok = data?.code === 0;
    return {
      ok,
      statusCode: response.status,
      errorCode: ok ? null : String(data?.code ?? "UNKNOWN"),
      errorMessage: ok ? null : (data?.msg || `飞书返回 code=${String(data?.code ?? "unknown")}`),
      recipientHint: "webhook",
      responseJson,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      errorCode: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
      recipientHint: webhookUrl ? "webhook" : null,
      responseJson: null,
    };
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

export async function sendFeishuByEnv(message: string, meta?: {
  eventType?: string;
  triggerSource?: string;
  jobId?: string | null;
  cycleId?: string | null;
  ticketId?: string | null;
  requestJson?: Record<string, unknown> | null;
}): Promise<boolean> {
  const webhookUrl = await resolveSecret("feishu_webhook_url");
  let result: FeishuSendResult;
  if (!webhookUrl) {
    result = {
      ok: false,
      statusCode: null,
      errorCode: "SECRET_MISSING",
      errorMessage: "Feishu Webhook URL 未配置",
      recipientHint: null,
      responseJson: null,
    };
  } else {
    result = await sendFeishuMessage({ webhookUrl, text: message });
  }

  if (meta) {
    try {
      await appendNotificationDeliveryLog({
        channel: "feishu",
        eventType: meta.eventType || "unknown",
        triggerSource: meta.triggerSource || "unknown",
        success: result.ok,
        statusCode: result.statusCode,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        recipientHint: result.recipientHint,
        jobId: meta.jobId || null,
        cycleId: meta.cycleId || null,
        ticketId: meta.ticketId || null,
        requestJson: {
          preview: String(message || "").slice(0, 200),
          ...(meta.requestJson || {}),
        },
        responseJson: result.responseJson,
      });
    } catch {
      // 忽略通知日志失败
    }
  }

  return result.ok;
}
