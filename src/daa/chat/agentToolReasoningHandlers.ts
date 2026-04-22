import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

import { normalizeText } from "@/src/daa/utils/normalize";

import { buildContextDigest, buildRecentConversation, describePendingAction } from "./agentContext";
import type { DaaAgentToolContext, DaaAgentToolExecutor, DaaAgentToolResult } from "./agentToolTypes";
import { buildAssistantHelpText } from "./agentToolViewHandlers";
import type { DaaChatPendingAction } from "./chatTypes";

function buildUnknownReply(input: {
  llmAnswer: string | null;
  pendingAction: DaaChatPendingAction | null;
}): DaaAgentToolResult {
  if (input.llmAnswer) {
    return {
      text: input.llmAnswer,
      intentKind: "llm_answer",
      pendingAction: input.pendingAction,
    };
  }
  return {
    text: `我已经接入了交易助手模式，但这条话我还没有稳定映射到结构化动作。\n\n${buildAssistantHelpText()}`,
    intentKind: "unknown",
    pendingAction: input.pendingAction,
  };
}

async function answerWithAssistantLlm(input: {
  question: string;
  runtimeContext: DaaAgentToolContext;
}): Promise<string | null> {
  try {
    const config = await resolveLlmConfig("research");
    if (!config.enabled || !config.apiKey || !config.endpoint || !config.model) return null;
    const pendingAction = input.runtimeContext.storedPendingAction;
    const prompt = [
      "你是 DAA 的私有交易助手，只能基于给定上下文回答，不要虚构订单或不存在的数据。",
      "回答要求：中文、直接、可操作；如果上下文不足，要明确说不足。",
      "",
      "系统上下文：",
      buildContextDigest(input.runtimeContext.readModel),
      "",
      "最近复盘经验：",
      normalizeText(input.runtimeContext.learningDigest) || "暂无",
      "",
      "会话记忆：",
      normalizeText(input.runtimeContext.sessionMemory?.summaryText) || "暂无",
      `待确认动作：${describePendingAction(pendingAction)}`,
      "",
      "最近对话：",
      buildRecentConversation(input.runtimeContext.recentMessages) || "暂无",
      "",
      `当前问题：${input.question}`,
    ].join("\n");
    const response = await callLlm(config, prompt);
    const text = normalizeText(response.text);
    return text || null;
  } catch (err) {
    logSwallowed("agentToolReasoningHandlers.runLlmReasoning", err);
    return null;
  }
}

export function createAssistantReasoningHandlers(input: DaaAgentToolContext): Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor> {
  const handlers = new Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor>();

  handlers.set("llm_answer", async () => {
    const llmAnswer = input.intent.kind === "llm_answer" && input.intent.answer
      ? input.intent.answer
      : await answerWithAssistantLlm({
        question: input.intent.rawText,
        runtimeContext: input,
      });
    return buildUnknownReply({ llmAnswer, pendingAction: input.currentPendingAction });
  });

  handlers.set("unknown", async () => {
    const llmAnswer = await answerWithAssistantLlm({
      question: input.intent.rawText,
      runtimeContext: input,
    });
    return buildUnknownReply({ llmAnswer, pendingAction: input.currentPendingAction });
  });

  return handlers;
}
