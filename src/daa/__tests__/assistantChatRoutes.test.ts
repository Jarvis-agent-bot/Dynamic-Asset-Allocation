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
import { GET as getWorkbenchBootstrap } from "@/app/api/daa/workbench/bootstrap/route";
import { GET as getSessions } from "@/app/api/daa/chat/sessions/route";
import { POST as postMessage } from "@/app/api/daa/chat/messages/route";
import { POST as telegramWebhook } from "@/app/api/daa/chat/telegram/webhook/route";
import { getDaaSystemConfig, saveDaaSystemConfig } from "@/src/daa/store/daaStorePg";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntime() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_GLOBAL_KEY];
}

describe("assistant-chat-routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetPgMemRuntime();
    process.env.TELEGRAM_CHAT_ID = "777";
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";

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

  it("web 助手可直接发起模拟买入并写入会话", async () => {
    const response = await postMessage(new Request("http://localhost/api/daa/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "买入 AAPL 2股" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(String(json.data.reply.text)).toContain("买入 AAPL 已提交模拟执行");
    expect(json.data.messages.length).toBeGreaterThanOrEqual(2);

    const bootstrapResponse = await getWorkbenchBootstrap(new Request("http://localhost/api/daa/workbench/bootstrap"));
    const bootstrapJson = await bootstrapResponse.json();
    const assetRow = bootstrapJson.data.assetUniverse.find((item: { assetKey: string }) => item.assetKey === "US::AAPL");
    expect(Number(assetRow.holdingQty)).toBeCloseTo(2, 6);

    const sessionResponse = await getSessions(new Request("http://localhost/api/daa/chat/sessions"));
    const sessionJson = await sessionResponse.json();
    expect(sessionResponse.status).toBe(200);
    expect(sessionJson.ok).toBe(true);
    expect(sessionJson.data.sessions.length).toBeGreaterThan(0);
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
    const firstCall = (((sendTelegramMessageMock as any).mock?.calls?.[0] || [])[0] || {}) as { text?: string };
    expect(String(firstCall.text || "")).toContain("当前组合状态");
  });
});
