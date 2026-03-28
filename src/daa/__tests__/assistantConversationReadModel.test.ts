import { beforeEach, describe, expect, it } from "vitest";

import { resetTestDb, isTestDbAvailable } from "@/src/daa/__tests__/testDbSetup";
import { appendChatMessage, getOrCreateChatSession } from "@/src/daa/chat/chatRepo";
import { loadWebAssistantConversationReadModel } from "@/src/daa/chat/chatConversationReadService";

describe.skipIf(!isTestDbAvailable())("assistant-conversation-read-model", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("会同时返回输入目标线程和当前查看线程", async () => {
    const webSession = await getOrCreateChatSession({
      channel: "web",
      sessionKey: "web:acct-1",
      title: "Web 助手 · tester@example.com",
      participantId: "tester@example.com",
      externalUserId: "acct-1",
    });
    const telegramSession = await getOrCreateChatSession({
      channel: "telegram",
      sessionKey: "telegram:777:111:main",
      title: "Telegram 助手",
      participantId: "tester",
      externalChatId: "777",
      externalUserId: "111",
    });

    await appendChatMessage({
      sessionId: webSession.sessionId,
      role: "assistant",
      body: "当前组合状态：总权益 10000 USD。",
      intentKind: "portfolio_status",
    });
    await appendChatMessage({
      sessionId: telegramSession.sessionId,
      role: "assistant",
      body: "当前市场状态：正常。",
      intentKind: "market_status",
    });

    const conversation = await loadWebAssistantConversationReadModel({
      accountId: "acct-1",
      username: "tester@example.com",
      sessionId: telegramSession.sessionId,
      messageLimit: 8,
      sessionLimit: 8,
    });

    expect(conversation.activeSession?.sessionId).toBe(webSession.sessionId);
    expect(conversation.selectedSession?.sessionId).toBe(telegramSession.sessionId);
    expect(conversation.activeThread?.channel).toBe("web");
    expect(conversation.selectedThread?.channel).toBe("telegram");
    expect(conversation.isPreviewingOtherThread).toBe(true);
    expect(conversation.messages.at(-1)?.body).toContain("当前市场状态");
  });
});
