import { describe, expect, it } from "vitest";

import { buildAssistantThreadFromSession, buildAssistantThreads } from "@/src/daa/chat/chatThreadTypes";

describe("assistant-thread-read-model", () => {
  it("会把 session preview 映射成 channel-agnostic thread", () => {
    const thread = buildAssistantThreadFromSession({
      sessionId: "sess-1",
      channel: "telegram",
      title: "Telegram 助手",
      participantId: "tester",
      externalChatId: "777",
      externalUserId: "111",
      threadId: "7",
      lastIntentKind: "portfolio_status",
      lastUserText: "组合状态",
      lastAssistantText: "当前组合状态：总权益 10000 USD。",
      latestMessageAt: "2026-03-23T12:00:00.000Z",
      updatedAt: "2026-03-23T12:00:00.000Z",
    });

    expect(thread).toMatchObject({
      threadKey: "telegram:777:111:7",
      sourceLabel: "Telegram",
      threadLabel: "话题 7",
      latestSnippet: "当前组合状态：总权益 10000 USD。",
    });
  });

  it("批量映射会保留顺序", () => {
    const threads = buildAssistantThreads([
      {
        sessionId: "sess-1",
        channel: "web",
        title: "Web 助手 · tester@example.com",
        participantId: "tester@example.com",
        externalChatId: null,
        externalUserId: "acct-1",
        threadId: null,
        lastIntentKind: "help",
        lastUserText: "帮助",
        lastAssistantText: "你可以直接发这些话：",
        latestMessageAt: "2026-03-23T12:00:00.000Z",
        updatedAt: "2026-03-23T12:00:00.000Z",
      },
      {
        sessionId: "sess-2",
        channel: "telegram",
        title: "Telegram 助手",
        participantId: "tester",
        externalChatId: "777",
        externalUserId: "111",
        threadId: null,
        lastIntentKind: "market_status",
        lastUserText: "市场状态",
        lastAssistantText: null,
        latestMessageAt: "2026-03-23T11:00:00.000Z",
        updatedAt: "2026-03-23T11:00:00.000Z",
      },
    ]);

    expect(threads.map((item) => item.sessionId)).toEqual(["sess-1", "sess-2"]);
    expect(threads[1]?.latestSnippet).toBe("市场状态");
  });
});
