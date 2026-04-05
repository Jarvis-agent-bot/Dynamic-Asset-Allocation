import { randomBytes } from "node:crypto";
import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { resolveSecret, writeSecret } from "@/src/daa/config/secretsManager";

export const runtime = "nodejs";

type WebhookAction = "register" | "status" | "unregister";

/**
 * POST /api/daa/store/secrets/telegram-webhook
 *
 * Actions:
 *  - register: 自动注册 Webhook URL + 生成 secret + 设置 allowlist
 *  - status:   查询当前 Webhook 状态
 *  - unregister: 移除 Webhook
 */
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ action?: unknown; allowlist?: unknown }>(req);
    const action = String(body?.action || "status").trim().toLowerCase() as WebhookAction;

    const botToken = await resolveSecret("telegram_bot_token");
    if (!botToken) {
      return fail("VALIDATION_FAILED", "Telegram Bot Token 未配置，请先在凭证区填写。", { status: 400 });
    }

    const chatId = await resolveSecret("telegram_chat_id");

    if (action === "status") {
      return ok(await getWebhookInfo(botToken));
    }

    if (action === "unregister") {
      const res = await callTelegramApi(botToken, "deleteWebhook", {});
      return ok({ success: res.ok, description: res.description || "已移除 Webhook" });
    }

    if (action === "register") {
      // 1. 确定 webhook URL
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const webhookUrl = `${proto}://${host}/api/daa/chat/telegram/webhook`;

      // 2. 生成 webhook secret
      const webhookSecret = randomBytes(32).toString("hex");

      // 3. 注册 Webhook
      const setResult = await callTelegramApi(botToken, "setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message"],
      });

      if (!setResult.ok) {
        return fail("INTERNAL_ERROR", `Telegram setWebhook 失败: ${setResult.description || "未知错误"}`, { status: 502 });
      }

      // 4. 写入 webhook_secret 到 DB
      await writeSecret("telegram_webhook_secret", webhookSecret);

      // 5. 设置 allowlist（默认使用 chatId，或用户自定义）
      const allowlistInput = String(body?.allowlist || "").trim();
      const allowlist = allowlistInput || chatId || "";
      if (allowlist) {
        await writeSecret("telegram_allowlist", allowlist);
      }

      // 6. 获取 Bot 信息
      const meResult = await callTelegramApi(botToken, "getMe", {});
      const botUsername = meResult.result?.username || "unknown";

      // 7. 获取最终 webhook info
      const info = await getWebhookInfo(botToken);

      return ok({
        success: true,
        botUsername,
        webhookUrl,
        allowlist,
        info,
        message: `Webhook 已注册到 @${botUsername}`,
      });
    }

    return fail("VALIDATION_FAILED", `未知 action: ${action}`, { status: 400 });
  });
}

async function callTelegramApi(botToken: string, method: string, body: Record<string, unknown>): Promise<{
  ok: boolean;
  description?: string;
  result?: Record<string, unknown>;
}> {
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/${method}`;
  const isGet = Object.keys(body).length === 0;

  const res = await fetch(url, isGet ? { method: "GET" } : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
}

async function getWebhookInfo(botToken: string): Promise<{
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate: number | null;
  lastErrorMessage: string | null;
  botUsername: string | null;
}> {
  const [infoRes, meRes] = await Promise.all([
    callTelegramApi(botToken, "getWebhookInfo", {}),
    callTelegramApi(botToken, "getMe", {}),
  ]);

  const info = infoRes.result || {};
  return {
    url: String(info.url || ""),
    hasCustomCertificate: Boolean(info.has_custom_certificate),
    pendingUpdateCount: Number(info.pending_update_count) || 0,
    lastErrorDate: Number(info.last_error_date) || null,
    lastErrorMessage: info.last_error_message ? String(info.last_error_message) : null,
    botUsername: meRes.result?.username ? String(meRes.result.username) : null,
  };
}
