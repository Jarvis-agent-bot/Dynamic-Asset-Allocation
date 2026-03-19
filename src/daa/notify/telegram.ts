import { resolveSecret } from "@/src/daa/config/secretsManager";
import { appendNotificationDeliveryLog } from "@/src/daa/store/notificationDeliveryLogRepo";

export type TelegramSendResult = {
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

export async function sendTelegramMessage(opts: {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: "HTML" | "Markdown" | null;
  replyToMessageId?: string | number | null;
}): Promise<TelegramSendResult> {
  const botToken = String(opts.botToken || "").trim();
  const chatId = String(opts.chatId || "").trim();
  const text = String(opts.text || "").trim();
  const replyToMessageId = opts.replyToMessageId == null ? null : String(opts.replyToMessageId).trim();
  if (!botToken || !chatId || !text) {
    return {
      ok: false,
      statusCode: null,
      errorCode: "MISSING_INPUT",
      errorMessage: "bot token / chat id / text 缺失",
      recipientHint: chatId || null,
      responseJson: null,
    };
  }

  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(opts.parseMode === null ? {} : { parse_mode: opts.parseMode || "Markdown" }),
        ...(replyToMessageId ? { reply_to_message_id: Number(replyToMessageId) } : {}),
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    const responseJson = toJsonObject(payload);
    if (!response.ok) {
      const description = responseJson && typeof responseJson.description === "string"
        ? responseJson.description
        : `HTTP ${response.status}`;
      return {
        ok: false,
        statusCode: response.status,
        errorCode: responseJson && typeof responseJson.error_code === "number"
          ? String(responseJson.error_code)
          : `HTTP_${response.status}`,
        errorMessage: description,
        recipientHint: chatId,
        responseJson,
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      errorCode: null,
      errorMessage: null,
      recipientHint: chatId,
      responseJson,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      errorCode: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
      recipientHint: chatId || null,
      responseJson: null,
    };
  }
}

export async function sendTelegramByEnv(message: string, meta?: {
  eventType?: string;
  triggerSource?: string;
  jobId?: string | null;
  cycleId?: string | null;
  ticketId?: string | null;
  requestJson?: Record<string, unknown> | null;
}): Promise<boolean> {
  const botToken = await resolveSecret("telegram_bot_token");
  const chatId = await resolveSecret("telegram_chat_id");
  let result: TelegramSendResult;
  if (!botToken || !chatId) {
    result = {
      ok: false,
      statusCode: null,
      errorCode: "SECRET_MISSING",
      errorMessage: !botToken ? "Telegram Bot Token 未配置" : "Telegram Chat ID 未配置",
      recipientHint: chatId || null,
      responseJson: null,
    };
  } else {
    result = await sendTelegramMessage({ botToken, chatId, text: message });
  }

  if (meta) {
    try {
      await appendNotificationDeliveryLog({
        channel: "telegram",
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
      // 通知日志失败不阻塞主链路
    }
  }

  return result.ok;
}
