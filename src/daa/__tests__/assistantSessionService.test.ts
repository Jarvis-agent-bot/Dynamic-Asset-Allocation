import { beforeEach, describe, expect, it } from "vitest";

import { resetPgMemRuntime } from "@/src/daa/__tests__/pgMemTestUtils";
import { buildWebAssistantSessionDescriptor } from "@/src/daa/chat/channelAdapters";
import { appendChatMessage } from "@/src/daa/chat/chatRepo";
import { loadWebAssistantConversationReadModel } from "@/src/daa/chat/chatConversationReadService";
import { getLatestAssistantSessionByChannel, prepareTelegramAssistantSession } from "@/src/daa/chat/chatSessionService";

describe("assistant-session-service", () => {
  beforeEach(() => {
    resetPgMemRuntime();
  });

  it("web descriptor 保持稳定", () => {
    const descriptor = buildWebAssistantSessionDescriptor({
      accountId: "acct-1",
      username: "tester@example.com",
    });

    expect(descriptor).toMatchObject({
      channel: "web",
      sessionKey: "web:acct-1",
      title: "Web 助手 · tester@example.com",
    });
  });

  it("telegram session 准备阶段可以识别重复入站消息", async () => {
    const inbound = {
      updateId: 1,
      text: "组合状态",
      chatId: "777",
      userId: "111",
      threadId: "main",
      externalMessageId: "42",
      replyToMessageId: "42",
      title: "Telegram 助手",
      participantId: "tester",
    };

    const first = await prepareTelegramAssistantSession(inbound);
    expect(first.duplicateMessage).toBeNull();

    await appendChatMessage({
      sessionId: first.session.sessionId,
      role: "user",
      body: inbound.text,
      intentKind: "portfolio_status",
      status: "completed",
      externalMessageId: inbound.externalMessageId,
    });

    const second = await prepareTelegramAssistantSession(inbound);
    expect(second.session.sessionId).toBe(first.session.sessionId);
    expect(second.duplicateMessage?.externalMessageId).toBe("42");
  });

  it("可以按 sessionId 读取指定线程时间线", async () => {
    const inbound = {
      updateId: 2,
      text: "市场状态",
      chatId: "777",
      userId: "111",
      threadId: null,
      externalMessageId: "99",
      replyToMessageId: "99",
      title: "Telegram 助手",
      participantId: "tester",
    };

    const prepared = await prepareTelegramAssistantSession(inbound);
    await appendChatMessage({
      sessionId: prepared.session.sessionId,
      role: "assistant",
      body: "当前市场状态：正常。",
      intentKind: "market_status",
    });

    const timeline = await loadWebAssistantConversationReadModel({
      accountId: "acct-1",
      username: "tester@example.com",
      sessionId: prepared.session.sessionId,
      messageLimit: 8,
      sessionLimit: 8,
    });

    expect(timeline.selectedSession?.sessionId).toBe(prepared.session.sessionId);
    expect(timeline.messages.at(-1)?.body).toContain("当前市场状态");
  });

  it("可以按渠道读取最近会话", async () => {
    const inbound = {
      updateId: 3,
      text: "风险状态",
      chatId: "888",
      userId: "222",
      threadId: null,
      externalMessageId: "100",
      replyToMessageId: "100",
      title: "Telegram 助手",
      participantId: "tester-2",
    };

    const prepared = await prepareTelegramAssistantSession(inbound);
    await appendChatMessage({
      sessionId: prepared.session.sessionId,
      role: "assistant",
      body: "当前风险状态：中性。",
      intentKind: "risk_status",
    });

    const latest = await getLatestAssistantSessionByChannel("telegram");
    expect(latest?.sessionId).toBe(prepared.session.sessionId);
    expect(latest?.lastIntentKind).toBe("risk_status");
  });
});
