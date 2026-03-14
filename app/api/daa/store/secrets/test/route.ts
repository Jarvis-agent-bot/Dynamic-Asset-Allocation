import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { resolveSecret, SECRET_KEY_DEFS_, type DaaSecretKey } from "@/src/daa/config/secretsManager";

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

async function testTelegram(): Promise<TestResult> {
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

async function testFeishu(): Promise<TestResult> {
  const start = Date.now();
  const webhookUrl = await resolveSecret("feishu_webhook_url");

  if (!webhookUrl) {
    return { key: "feishu_webhook_url", success: false, message: "Webhook URL 未配置", latencyMs: Date.now() - start };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: "DeepLedger 连通性测试 ✅" },
      }),
    });

    if (!response.ok) {
      return { key: "feishu_webhook_url", success: false, message: `HTTP ${response.status}`, latencyMs: Date.now() - start };
    }

    const data = (await response.json().catch(() => ({}))) as { code?: number };
    if (data.code !== 0) {
      return { key: "feishu_webhook_url", success: false, message: `飞书返回 code=${data.code}`, latencyMs: Date.now() - start };
    }

    return { key: "feishu_webhook_url", success: true, message: "已发送测试消息", latencyMs: Date.now() - start };
  } catch (e) {
    return { key: "feishu_webhook_url", success: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
  }
}

async function testResend(): Promise<TestResult> {
  const start = Date.now();
  const apiKey = await resolveSecret("resend_api_key");

  if (!apiKey) {
    return { key: "resend_api_key", success: false, message: "API Key 未配置", latencyMs: Date.now() - start };
  }

  try {
    // Use Resend's domains endpoint to validate the API key without sending email
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return { key: "resend_api_key", success: false, message: `HTTP ${response.status}: API Key 无效`, latencyMs: Date.now() - start };
    }

    return { key: "resend_api_key", success: true, message: "API Key 验证通过", latencyMs: Date.now() - start };
  } catch (e) {
    return { key: "resend_api_key", success: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
  }
}

const TEST_HANDLERS: Record<string, () => Promise<TestResult>> = {
  llm_api_key: testLlm,
  telegram_bot_token: testTelegram,
  feishu_webhook_url: testFeishu,
  resend_api_key: testResend,
};

/** POST — test connectivity for a specific secret. */
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ key?: unknown }>(req);
    if (!body || !isValidSecretKey(body.key)) {
      return fail("VALIDATION_FAILED", "invalid or missing secret key", { status: 400 });
    }

    const handler = TEST_HANDLERS[body.key];
    if (!handler) {
      return fail("VALIDATION_FAILED", `no connectivity test available for ${body.key}`, { status: 400 });
    }

    const result = await handler();
    return ok({ result });
  });
}
