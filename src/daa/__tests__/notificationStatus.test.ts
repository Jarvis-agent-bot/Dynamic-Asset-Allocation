import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendChatMessage, getOrCreateChatSession } from "@/src/daa/chat/chatRepo";
import { buildNotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import { getDaaSystemConfig, saveDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { appendNotificationDeliveryLog } from "@/src/daa/store/notificationDeliveryLogRepo";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntime() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_GLOBAL_KEY];
}

function clearTelegramEnv() {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_ALLOWLIST;
  delete process.env.DAA_TELEGRAM_BOT_TOKEN;
  delete process.env.DAA_TELEGRAM_CHAT_ID;
  delete process.env.DAA_TELEGRAM_WEBHOOK_SECRET;
  delete process.env.DAA_TELEGRAM_ALLOWLIST;
}

describe("notification-status", () => {
  beforeEach(async () => {
    resetPgMemRuntime();
    clearTelegramEnv();

    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        notification: {
          ...current.config.notification,
          telegram: {
            ...current.config.notification.telegram,
            enabled: true,
            onTradeExecuted: true,
          },
        },
      },
    });
  });

  afterEach(() => {
    clearTelegramEnv();
  });

  it("会同时汇总 Telegram 出站通知和对话助手状态", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_CHAT_ID = "777";
    process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-secret";
    process.env.TELEGRAM_ALLOWLIST = "777,777:111";

    const session = await getOrCreateChatSession({
      channel: "telegram",
      sessionKey: "telegram:777:111:main",
      title: "Telegram 助手",
      participantId: "tester",
      externalChatId: "777",
      externalUserId: "111",
      threadId: null,
    });
    await appendChatMessage({
      sessionId: session.sessionId,
      role: "user",
      body: "组合状态",
      intentKind: "portfolio_status",
      externalMessageId: "1",
    });
    await appendChatMessage({
      sessionId: session.sessionId,
      role: "assistant",
      body: "当前组合状态：总权益 10000 USD。",
      intentKind: "portfolio_status",
    });
    await appendNotificationDeliveryLog({
      channel: "telegram",
      eventType: "test_message",
      triggerSource: "settings_secret_test",
      success: true,
      recipientHint: "777",
    });

    const summary = await buildNotificationStatusSummary();

    expect(summary.channels.telegram.configured).toBe(true);
    expect(summary.channels.telegram.lastSuccessAt).toBeTruthy();
    expect(summary.telegramAssistant.ready).toBe(true);
    expect(summary.telegramAssistant.lastSessionAt).toBeTruthy();
    expect(summary.telegramAssistant.lastUserText).toBe("组合状态");
    expect(summary.telegramAssistant.lastAssistantText).toContain("当前组合状态");
    expect(summary.telegramAssistant.participantId).toBe("tester");
  });

  it("缺少 webhook secret 或 allowlist 时，会明确标记 Telegram 对话助手未就绪", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_CHAT_ID = "777";

    const summary = await buildNotificationStatusSummary();

    expect(summary.channels.telegram.configured).toBe(true);
    expect(summary.telegramAssistant.ready).toBe(false);
    expect(summary.telegramAssistant.secretStates.find((item) => item.key === "telegram_webhook_secret")?.configured).toBe(false);
    expect(summary.telegramAssistant.secretStates.find((item) => item.key === "telegram_allowlist")?.configured).toBe(false);
    expect(summary.telegramAssistant.lastSessionAt).toBeNull();
  });
});
