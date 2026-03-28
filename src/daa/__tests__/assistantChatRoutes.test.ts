import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/auth/daaAuthRequest", () => ({
  getDaaAuthContextFromRequest: vi.fn(async () => ({
    token: "",
    account: {
      accountId: "acct-1",
      username: "tester@example.com",
      roles: ["editor"],
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    session: {
      sessionId: "sess-1",
      accountId: "acct-1",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      revokedAt: null,
      lastSeenAt: new Date().toISOString(),
      userAgent: "vitest",
      ip: "127.0.0.1",
    },
  })),
}));

const { sendTelegramMessageMock } = vi.hoisted(() => ({
  sendTelegramMessageMock: vi.fn(async () => ({
    ok: true,
    statusCode: 200,
    errorCode: null,
    errorMessage: null,
    recipientHint: "777",
    responseJson: {},
  })),
}));

vi.mock("@/src/daa/notify/telegram", async () => {
  const actual = await vi.importActual<typeof import("@/src/daa/notify/telegram")>("@/src/daa/notify/telegram");
  return {
    ...actual,
    sendTelegramMessage: sendTelegramMessageMock,
    sendTelegramByEnv: vi.fn(async () => true),
  };
});

import { POST as upsertAsset } from "@/app/api/daa/workbench/assets/upsert/route";
import { GET as getWorkbenchReadModel } from "@/app/api/daa/read/workbench/route";
import { GET as getSessions } from "@/app/api/daa/chat/sessions/route";
import { POST as postMessage } from "@/app/api/daa/chat/messages/route";
import { POST as telegramWebhook } from "@/app/api/daa/chat/telegram/webhook/route";
import { resetTestDb, isTestDbAvailable } from "@/src/daa/__tests__/testDbSetup";
import { getDaaSystemConfig, saveDaaSystemConfig } from "@/src/daa/store/daaStorePg";

function getTelegramReplyText(callIndex: number): string {
  const calls = vi.mocked(sendTelegramMessageMock).mock.calls as Array<Array<{ text?: string }>>;
  const [input] = calls[callIndex] || [];
  return typeof input?.text === "string" ? input.text : "";
}

describe.skipIf(!isTestDbAvailable())("assistant-chat-routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetTestDb();
    process.env.TELEGRAM_CHAT_ID = "777";
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.DAA_TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_ALLOWLIST;
    delete process.env.DAA_TELEGRAM_ALLOWLIST;

    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          account: {
            ...current.config.strategy.account,
            baseCurrency: "USD",
            cash: 10000,
            frozenCash: 0,
            investableCash: 10000,
          },
        },
        dataSources: {
          ...current.config.dataSources,
          priceFeed: {
            ...current.config.dataSources.priceFeed,
            enabled: false,
          },
        },
      },
    });

    await upsertAsset(new Request("http://localhost/api/daa/workbench/assets/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "EQUITY",
        region: "US",
        exchange: "NASDAQ",
        instrumentType: "STOCK",
        marketGroup: "US_EQUITY",
        watchEnabled: true,
        lastPrice: 100,
      }),
    }));
  });

  it("web 助手会先进入待确认，再执行模拟买入并写入会话", async () => {
    const previewResponse = await postMessage(new Request("http://localhost/api/daa/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "买入 AAPL 2股" }),
    }));
    const previewJson = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(previewJson.ok).toBe(true);
    expect(String(previewJson.data.reply.text)).toContain("已进入待确认");

    const previewBootstrapResponse = await getWorkbenchReadModel(new Request("http://localhost/api/daa/read/workbench"));
    const previewBootstrapJson = await previewBootstrapResponse.json();
    const previewAssetRow = previewBootstrapJson.data.bootstrap.assetUniverse.find((item: { assetKey: string }) => item.assetKey === "US::AAPL");
    expect(Number(previewAssetRow.holdingQty)).toBeCloseTo(0, 6);

    const confirmResponse = await postMessage(new Request("http://localhost/api/daa/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "确认" }),
    }));
    const confirmJson = await confirmResponse.json();

    expect(confirmResponse.status).toBe(200);
    expect(confirmJson.ok).toBe(true);
    expect(String(confirmJson.data.reply.text)).toContain("买入 AAPL 已在本地模拟账本成交");
    expect(confirmJson.data.messages.length).toBeGreaterThanOrEqual(4);

    const bootstrapResponse = await getWorkbenchReadModel(new Request("http://localhost/api/daa/read/workbench"));
    const bootstrapJson = await bootstrapResponse.json();
    const assetRow = bootstrapJson.data.bootstrap.assetUniverse.find((item: { assetKey: string }) => item.assetKey === "US::AAPL");
    expect(Number(assetRow.holdingQty)).toBeCloseTo(2, 6);

    const sessionResponse = await getSessions(new Request("http://localhost/api/daa/chat/sessions"));
    const sessionJson = await sessionResponse.json();
    expect(sessionResponse.status).toBe(200);
    expect(sessionJson.ok).toBe(true);
    expect(sessionJson.data.sessions.length).toBeGreaterThan(0);
    expect(sessionJson.data.threads.length).toBeGreaterThan(0);
    expect(sessionJson.data.threads[0]).toMatchObject({
      channel: "web",
      sourceLabel: "Web",
    });
  });

  it("telegram webhook 可读取组合状态并回发消息", async () => {
    const response = await telegramWebhook(new Request("http://localhost/api/daa/chat/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 1,
        message: {
          message_id: 9,
          text: "组合状态",
          chat: { id: 777, type: "private" },
          from: { id: 111, username: "tester" },
        },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
    expect(getTelegramReplyText(0)).toContain("当前组合状态");

    const sessionResponse = await getSessions(new Request(`http://localhost/api/daa/chat/sessions?sessionId=${json.data.sessionId}`));
    const sessionJson = await sessionResponse.json();
    expect(sessionResponse.status).toBe(200);
    expect(sessionJson.ok).toBe(true);
    expect(sessionJson.data.session?.sessionId).toBe(json.data.sessionId);
    expect(sessionJson.data.messages.at(-1)?.body).toContain("当前组合状态");
    expect(sessionJson.data.conversation.selectedThread?.channel).toBe("telegram");
  });

  it("查看其他线程时仍会保留当前 Web 会话作为输入目标", async () => {
    const webResponse = await postMessage(new Request("http://localhost/api/daa/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "组合状态" }),
    }));
    const webJson = await webResponse.json();

    const telegramResponse = await telegramWebhook(new Request("http://localhost/api/daa/chat/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 2,
        message: {
          message_id: 10,
          text: "市场状态",
          chat: { id: 777, type: "private" },
          from: { id: 111, username: "tester" },
        },
      }),
    }));
    const telegramJson = await telegramResponse.json();

    expect(webResponse.status).toBe(200);
    expect(webJson.ok).toBe(true);
    expect(telegramResponse.status).toBe(200);
    expect(telegramJson.ok).toBe(true);

    const sessionResponse = await getSessions(new Request(`http://localhost/api/daa/chat/sessions?sessionId=${telegramJson.data.sessionId}`));
    const sessionJson = await sessionResponse.json();

    expect(sessionResponse.status).toBe(200);
    expect(sessionJson.ok).toBe(true);
    expect(sessionJson.data.conversation.activeThread).toMatchObject({
      channel: "web",
      sourceLabel: "Web",
    });
    expect(sessionJson.data.conversation.selectedThread).toMatchObject({
      channel: "telegram",
      sourceLabel: "Telegram",
    });
    expect(sessionJson.data.conversation.isPreviewingOtherThread).toBe(true);
  });

  it("telegram webhook 的执行类命令需要二次确认后才会真正成交", async () => {
    const previewResponse = await telegramWebhook(new Request("http://localhost/api/daa/chat/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 20,
        message: {
          message_id: 21,
          text: "买入 AAPL 2股",
          chat: { id: 777, type: "private" },
          from: { id: 111, username: "tester" },
        },
      }),
    }));
    const previewJson = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(previewJson.ok).toBe(true);
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
    expect(getTelegramReplyText(0)).toContain("已进入待确认");

    const previewBootstrapResponse = await getWorkbenchReadModel(new Request("http://localhost/api/daa/read/workbench"));
    const previewBootstrapJson = await previewBootstrapResponse.json();
    const previewAssetRow = previewBootstrapJson.data.bootstrap.assetUniverse.find((item: { assetKey: string }) => item.assetKey === "US::AAPL");
    expect(Number(previewAssetRow.holdingQty)).toBeCloseTo(0, 6);

    const confirmResponse = await telegramWebhook(new Request("http://localhost/api/daa/chat/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 22,
        message: {
          message_id: 23,
          text: "确认",
          chat: { id: 777, type: "private" },
          from: { id: 111, username: "tester" },
        },
      }),
    }));
    const confirmJson = await confirmResponse.json();

    expect(confirmResponse.status).toBe(200);
    expect(confirmJson.ok).toBe(true);
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(2);
    expect(getTelegramReplyText(1)).toContain("买入 AAPL 已在本地模拟账本成交");

    const bootstrapResponse = await getWorkbenchReadModel(new Request("http://localhost/api/daa/read/workbench"));
    const bootstrapJson = await bootstrapResponse.json();
    const assetRow = bootstrapJson.data.bootstrap.assetUniverse.find((item: { assetKey: string }) => item.assetKey === "US::AAPL");
    expect(Number(assetRow.holdingQty)).toBeCloseTo(2, 6);
  });

  it("telegram webhook 对重复消息幂等，不会重复回发或重复执行", async () => {
    const payload = {
      update_id: 9,
      message: {
        message_id: 42,
        text: "组合状态",
        chat: { id: 777, type: "private" },
        from: { id: 111, username: "tester" },
      },
    };

    const firstResponse = await telegramWebhook(new Request("http://localhost/api/daa/chat/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    const firstJson = await firstResponse.json();

    const secondResponse = await telegramWebhook(new Request("http://localhost/api/daa/chat/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    const secondJson = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstJson.ok).toBe(true);
    expect(secondResponse.status).toBe(200);
    expect(secondJson.ok).toBe(true);
    expect(secondJson.data.duplicate).toBe(true);
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
  });

  it("telegram webhook secret 不匹配时拒绝请求", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";

    const response = await telegramWebhook(new Request("http://localhost/api/daa/chat/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong-secret",
      },
      body: JSON.stringify({
        update_id: 10,
        message: {
          message_id: 11,
          text: "组合状态",
          chat: { id: 777, type: "private" },
          from: { id: 111, username: "tester" },
        },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });
});
