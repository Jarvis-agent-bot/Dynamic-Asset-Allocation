import { resolveSecret } from "@/src/daa/config/secretsManager";
import { ManualTradeServiceError } from "@/src/daa/modules/workbench/manualTradeService";

import { appendChatMessage, appendChatToolCall, getChatSessionMemory, getOrCreateChatSession } from "./chatRepo";
import {
  loadAssistantRuntimeContext,
  normalizeText,
  parsePendingAction,
  resolveCurrentPendingAction,
  saveAssistantSessionSnapshot,
} from "./agentContext";
import { assistantIntentKind, planAssistantTurn } from "./agentPlanner";
import { executeAssistantIntent } from "./agentTools";
import type { DaaChatChannel } from "./chatTypes";

export async function runAssistantTurn(input: {
  channel: DaaChatChannel;
  sessionKey: string;
  userText: string;
  title?: string | null;
  participantId?: string | null;
  externalChatId?: string | null;
  externalUserId?: string | null;
  threadId?: string | null;
  externalMessageId?: string | null;
  allowExecution?: boolean;
}) {
  const session = await getOrCreateChatSession({
    channel: input.channel,
    sessionKey: input.sessionKey,
    title: input.title || null,
    participantId: input.participantId || null,
    externalChatId: input.externalChatId || null,
    externalUserId: input.externalUserId || null,
    threadId: input.threadId || null,
  });

  try {
    const runtimeContext = await loadAssistantRuntimeContext(session.sessionId);
    const planning = await planAssistantTurn({
      userText: input.userText,
      allowExecution: input.allowExecution === true,
      runtimeContext,
    });
    const intent = planning.intent;
    const userMessage = await appendChatMessage({
      sessionId: session.sessionId,
      role: "user",
      body: input.userText,
      intentKind: assistantIntentKind(intent),
      status: "completed",
      externalMessageId: input.externalMessageId || null,
      metaJson: {
        plannerSource: planning.source,
      },
    });
    await appendChatToolCall({
      sessionId: session.sessionId,
      messageId: userMessage.messageId,
      toolName: "planAssistantIntent",
      status: "ok",
      inputJson: {
        allowExecution: input.allowExecution === true,
        hasPendingAction: Boolean(runtimeContext.storedPendingAction),
      },
      resultJson: {
        source: planning.source,
        intentKind: assistantIntentKind(intent),
        plannerRawText: planning.plannerRawText,
      },
    });

    const reply = await executeAssistantIntent({
      ...runtimeContext,
      intent,
      currentPendingAction: resolveCurrentPendingAction({
        intentKind: assistantIntentKind(intent),
        storedPendingAction: runtimeContext.storedPendingAction,
      }),
      allowExecution: input.allowExecution === true,
      requireConfirmation: input.allowExecution === true,
      sessionId: session.sessionId,
      userMessageId: userMessage.messageId,
    });
    const assistantMessage = await appendChatMessage({
      sessionId: session.sessionId,
      role: "assistant",
      body: reply.text,
      intentKind: reply.intentKind,
      status: "completed",
    });
    await saveAssistantSessionSnapshot({
      sessionId: session.sessionId,
      sessionMemory: runtimeContext.sessionMemory,
      userText: input.userText,
      assistantText: reply.text,
      intentKind: reply.intentKind,
      pendingAction: reply.pendingAction,
    });
    return {
      session,
      intentKind: reply.intentKind,
      userMessage,
      assistantMessage,
      assistantText: reply.text,
    };
  } catch (error) {
    const userMessage = await appendChatMessage({
      sessionId: session.sessionId,
      role: "user",
      body: input.userText,
      intentKind: "unknown",
      status: "completed",
      externalMessageId: input.externalMessageId || null,
    });
    const errorMessage = error instanceof ManualTradeServiceError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error || "unknown_error");
    await appendChatToolCall({
      sessionId: session.sessionId,
      messageId: userMessage.messageId,
      toolName: "assistant_turn",
      status: "failed",
      errorText: errorMessage,
    });
    const assistantMessage = await appendChatMessage({
      sessionId: session.sessionId,
      role: "assistant",
      body: `这次请求没有完成：${errorMessage}`,
      intentKind: "unknown",
      status: "failed",
    });
    const sessionMemory = await getChatSessionMemory(session.sessionId);
    await saveAssistantSessionSnapshot({
      sessionId: session.sessionId,
      sessionMemory,
      userText: input.userText,
      assistantText: assistantMessage.body,
      intentKind: "unknown",
      pendingAction: parsePendingAction(sessionMemory?.metaJson?.pendingAction),
    });
    return {
      session,
      intentKind: "unknown" as const,
      userMessage,
      assistantMessage,
      assistantText: assistantMessage.body,
    };
  }
}

function parseAllowlist(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export async function isTelegramSenderAllowed(input: {
  chatId: string;
  userId: string;
}) {
  const [allowlistRaw, configuredChatId] = await Promise.all([
    resolveSecret("telegram_allowlist"),
    resolveSecret("telegram_chat_id"),
  ]);
  const allowlist = parseAllowlist(allowlistRaw);
  if (allowlist.size === 0) {
    return normalizeText(configuredChatId) === input.chatId;
  }
  return allowlist.has(input.chatId) || allowlist.has(input.userId) || allowlist.has(`${input.chatId}:${input.userId}`);
}
