import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { DAA_BRAND_NAME } from "@/src/daa/brand";
import { resolveSecret, SECRET_KEY_DEFS_, type DaaSecretKey } from "@/src/daa/config/secretsManager";
import { sendFeishuMessage } from "@/src/daa/notify/feishu";
import { sendTelegramMessage } from "@/src/daa/notify/telegram";
import { appendNotificationDeliveryLog } from "@/src/daa/store/notificationDeliveryLogRepo";

export const runtime = "nodejs";

function isValidSecretKey(key: unknown): key is DaaSecretKey {
  return typeof key === "string" && SECRET_KEY_DEFS_.some((d) => d.key === key);
}

type TestResult = {
  key: string;
  success: boolean;
  message: string;
  latencyMs: number;
};

type TestMode = "connectivity" | "deliver";

function normalizeMode(value: unknown): TestMode {
  return String(value || "").trim().toLowerCase() === "deliver" ? "deliver" : "connectivity";
}

async function testLlm(): Promise<TestResult> {
  const start = Date.now();
  const apiKey = await resolveSecret("llm_api_key");
  const endpoint = (await resolveSecret("llm_endpoint")) || "https://api.deepseek.com/v1/chat/completions";
  const model = (await resolveSecret("llm_model")) || "deepseek-chat";

  if (!apiKey) {
    return { key: "llm_api_key", success: false, message: "API Key 未配置", latencyMs: Date.now() - start };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "回复 ok 即可。" }],
        max_tokens: 10,
        temperature: 0,
      }),
    });
    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { key: "llm_api_key", success: false, message: `HTTP ${response.status}: ${body.slice(0, 100)}`, latencyMs: Date.now() - start };
    }

    return { key: "llm_api_key", success: true, message: `连通正常 (${model}@${new URL(endpoint).hostname})`, latencyMs: Date.now() - start };
  } catch (e) {
    return { key: "llm_api_key", success: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
  }
}

async function testTelegram(mode: TestMode): Promise<TestResult> {
  const start = Date.now();
  const botToken = await resolveSecret("telegram_bot_token");
  const chatId = await resolveSecret("telegram_chat_id");

  if (!botToken) {
    return { key: "telegram_bot_token", success: false, message: "Bot Token 未配置", latencyMs: Date.now() - start };
  }
  if (!chatId) {
    return { key: "telegram_bot_token", success: false, message: "Chat ID 未配置", latencyMs: Date.now() - start };
  }

  try {
    if (mode === "deliver") {
      const text = `${DAA_BRAND_NAME} 测试消息\n时间: ${new Date().toISOString()}`;
      const result = await sendTelegramMessage({
        botToken,
        chatId,
        text,
      });
      await appendNotificationDeliveryLog({
        channel: "telegram",
        eventType: "test_message",
        triggerSource: "settings_secret_test",
        success: result.ok,
        statusCode: result.statusCode,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        recipientHint: result.recipientHint,
        requestJson: { mode, preview: text },
        responseJson: result.responseJson,
      });
      return {
        key: "telegram_bot_token",
        success: result.ok,
        message: result.ok ? "已发送 Telegram 测试消息" : (result.errorMessage || "Telegram 测试消息发送失败"),
        latencyMs: Date.now() - start,
      };
    }

    // Use getMe to validate bot token without sending a message
    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/getMe`;
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { key: "telegram_bot_token", success: false, message: `HTTP ${response.status}: ${body.slice(0, 100)}`, latencyMs: Date.now() - start };
    }

    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string } };
    const botName = data.result?.username || "unknown";
    return { key: "telegram_bot_token", success: true, message: `Bot @${botName} 验证通过，Chat ID 已配置`, latencyMs: Date.now() - start };
  } catch (e) {
    return { key: "telegram_bot_token", success: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
  }
}

async function testFeishu(mode: TestMode): Promise<TestResult> {
  const start = Date.now();
  const webhookUrl = await resolveSecret("feishu_webhook_url");

  if (!webhookUrl) {
    return { key: "feishu_webhook_url", success: false, message: "Webhook URL 未配置", latencyMs: Date.now() - start };
  }

  try {
    const result = await sendFeishuMessage({
      webhookUrl,
      text: mode === "deliver" ? `${DAA_BRAND_NAME} 测试消息 ✅\n时间: ${new Date().toISOString()}` : `${DAA_BRAND_NAME} 连通性测试 ✅`,
    });
    if (mode === "deliver") {
      await appendNotificationDeliveryLog({
        channel: "feishu",
        eventType: "test_message",
        triggerSource: "settings_secret_test",
        success: result.ok,
        statusCode: result.statusCode,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        recipientHint: result.recipientHint,
        requestJson: { mode },
        responseJson: result.responseJson,
      });
    }
    if (!result.ok) {
      return {
        key: "feishu_webhook_url",
        success: false,
        message: result.errorMessage || "飞书测试失败",
        latencyMs: Date.now() - start,
      };
    }
    return {
      key: "feishu_webhook_url",
      success: true,
      message: mode === "deliver" ? "已发送飞书测试消息" : "飞书 webhook 连通正常",
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return { key: "feishu_webhook_url", success: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
  }
}

/** POST — test connectivity for a specific secret. */
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ key?: unknown; mode?: unknown }>(req);
    if (!body || !isValidSecretKey(body.key)) {
      return fail("VALIDATION_FAILED", "invalid or missing secret key", { status: 400 });
    }

    const mode = normalizeMode(body.mode);
    let result: TestResult | null = null;
    if (body.key === "llm_api_key") {
      result = await testLlm();
    } else if (body.key === "telegram_bot_token") {
      result = await testTelegram(mode);
    } else if (body.key === "feishu_webhook_url") {
      result = await testFeishu(mode);
    }

    if (!result) {
      return fail("VALIDATION_FAILED", `no connectivity test available for ${body.key}`, { status: 400 });
    }

    return ok({ result, mode });
  });
}
