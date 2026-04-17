/**
 * Cognitive Agent — Next Target 辅助节点
 */

import type { CognitiveState, CognitiveUpdate } from "@/src/daa/agent/cognitiveState";
import type { ResearchThread } from "@/src/daa/agent/cognitiveTypes";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";

export async function loadNextTarget(state: CognitiveState): Promise<CognitiveUpdate> {
  const queue = Array.isArray(state.investigationQueue) ? state.investigationQueue : [];
  const remaining = queue.slice(1);
  const next = remaining[0] ?? null;

  let currentThread: ResearchThread | null = null;
  if (next?.threadId) {
    currentThread = await thesisStore.getThesisById(next.threadId);
  }

  return {
    investigationQueue: remaining,
    currentTarget: next,
    currentThread,
    investigateResult: null,
  };
}
