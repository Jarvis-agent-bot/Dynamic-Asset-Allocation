/**
 * 投资助理复核工作流 — Reflect 节点（DeepSeek checkpoint — 只在 conviction 变化时有意义）
 */

import type { CognitiveState, CognitiveUpdate } from "@/src/daa/agent/cognitiveState";
import { buildReflectPrompt } from "@/src/daa/agent/cognitivePrompts";
import { callDeepSeekJson } from "@/src/daa/agent/helpers/llm";
import { validateShape, shouldCircuitBreak } from "@/src/daa/agent/helpers/validation";
import { generateEmbedding } from "@/src/daa/agent/embedding";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function reflectNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  const result = state.investigateResult;
  const thread = state.currentThread;

  // 如果 conviction 没变，跳过反思
  if (!result?.thesisChanged || !thread) {
    return {};
  }

  if (shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
    return { errors: ["reflect: 熔断 — 跳过"] };
  }

  try {
    const prompt = buildReflectPrompt({
      thread,
      updatedThesis: result.updatedThesis ?? "",
      newConviction: result.newConviction ?? thread.conviction,
      evidenceSummary: result.evidenceSummary,
    });

    const { data, tokensUsed } = await callDeepSeekJson<{
      reflectionSummary: string;
      overreactionRisk: string;
      newMemory: { type: string; content: string } | null;
    }>(prompt, "cognitiveGraph.reflect");

    // P0-2: 校验 reflect 输出
    if (data) {
      const valErrors = validateShape(data, { reflectionSummary: "string", overreactionRisk: "string" });
      if (valErrors.length > 0) {
        logSwallowed("cognitiveGraph.reflect.validation", new Error(valErrors.join("; ")));
      }
    }

    let newMemCount = 0;
    if (data?.newMemory?.content) {
      try {
        const emb = await generateEmbedding(data.newMemory.content);
        // P2-10: 在 relevanceTags 中加入当前 threadId；thread 参数驱动实体图抽取
        await memoryStore.createMemory({
          memoryType: (data.newMemory.type as "lesson" | "pattern" | "preference" | "fact") || "lesson",
          content: data.newMemory.content,
          relevanceTags: [thread.id, ...thread.tags],
          embedding: emb,
          thread: { id: thread.id, assetKeys: thread.assetKeys, tags: thread.tags },
        });
        newMemCount = 1;
      } catch (e) {
        logSwallowed("cognitiveGraph.reflect.embedding", e);
      }
    }

    return {
      memoriesCreated: newMemCount,
      totalTokens: tokensUsed,
      reasoningTraces: [{
        node: "reflect",
        threadId: thread.id,
        input: `conviction change: ${thread.conviction} → ${result.newConviction}`,
        output: data ? `risk=${data.overreactionRisk}, memory=${newMemCount > 0 ? "created" : "none"}` : "no result",
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.reflect", e);
    return { errors: [`reflect: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
