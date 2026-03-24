import { describe, expect, it } from "vitest";

import {
  buildTelegramAssistantSessionDescriptor,
  buildWebAssistantSessionDescriptor,
  parseTelegramInboundUpdate,
} from "@/src/daa/chat/channelAdapters";

describe("assistant-channel-adapters", () => {
  it("生成 web 会话描述", () => {
    const result = buildWebAssistantSessionDescriptor({
      accountId: "acct-1",
      username: "tester@example.com",
    });

    expect(result).toMatchObject({
      channel: "web",
      sessionKey: "web:acct-1",
      title: "Web 助手 · tester@example.com",
      participantId: "tester@example.com",
      externalUserId: "acct-1",
    });
  });

  it("解析 telegram update 并生成线程级会话描述", () => {
    const inbound = parseTelegramInboundUpdate({
      update_id: 9,
      message: {
        message_id: 42,
        message_thread_id: 7,
        text: "组合状态",
        chat: { id: 777, type: "supergroup", title: "DAA" },
        from: { id: 111, username: "tester" },
      },
    });

    expect(inbound).not.toBeNull();
    expect(inbound).toMatchObject({
      updateId: 9,
      text: "组合状态",
      chatId: "777",
      userId: "111",
      threadId: "7",
      externalMessageId: "42",
      title: "DAA",
      participantId: "tester",
    });

    const descriptor = buildTelegramAssistantSessionDescriptor(inbound!);
    expect(descriptor).toMatchObject({
      channel: "telegram",
      sessionKey: "telegram:777:111:7",
      externalChatId: "777",
      externalUserId: "111",
      threadId: "7",
    });
  });
});
