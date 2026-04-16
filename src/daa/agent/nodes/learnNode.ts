/**
 * Cognitive Agent — Learn 节点（Phase 2: 策略学习 — review 后提炼调查策略模板）
 */

import type { CognitiveState, CognitiveUpdate } from "@/src/daa/agent/cognitiveState";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function learnNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    // 前置条件：本次 cycle 有实际调查产出
    if ((state.thesesUpdated ?? 0) === 0 && (state.memoriesCreated ?? 0) === 0) {
      return {}; // 无有效产出，跳过学习
    }

    const { extractStrategyFromRun } = await import("@/src/daa/agent/learning/strategyExtractor");

    // 从当前 cycle 的工具调用记录中提炼策略
    const toolsCalled = state.toolsCalled ?? [];
    const result = await extractStrategyFromRun({
      runId: `cycle_${Date.now()}`, // 临时 ID，后续由 agentRunStore 补全
      toolsCalled: toolsCalled.map(tc => ({
        tool: tc.tool,
        input: tc.input,
        outputSummary: tc.outputSummary,
      })),
      thesesUpdated: state.thesesUpdated ?? 0,
      surprises: (state.surprises ?? []).length,
      regime: state.market?.regime ?? "unknown",
      targetConvictions: state.activeTheses
        .filter(t => (state.investigationQueue ?? []).some(q => q.threadId === t.id))
        .map(t => t.conviction),
    });

    if (result.created) {
      logSwallowed("cognitiveGraph.learn.created", new Error(`策略已提炼: ${result.strategyName}`));
    }

    return {
      toolsCalled: [{
        tool: "learn",
        input: {},
        outputSummary: result.created ? `策略提炼: ${result.strategyName}` : "无新策略",
        durationMs: Date.now() - t0,
      }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.learn", e);
    return {};
  }
}
