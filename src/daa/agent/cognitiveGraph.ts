/**
 * Cognitive Agent OS — LangGraph 工作流协调器
 *
 * 完整循环：observe → prioritize → investigate ⇄ reflect → review → learn → surface → END
 *
 * 拆分后职责：图组装 + 单例管理 + 主入口。
 * 各节点实现见 nodes/*.ts，辅助函数见 helpers/*.ts。
 */

import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { CognitiveStateAnnotation, type CognitiveState } from "@/src/daa/agent/cognitiveState";
import type { InvestigationTarget, Surprise, DailyBriefing } from "@/src/daa/agent/cognitiveTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ── 节点导入 ──
import { observeNode } from "@/src/daa/agent/nodes/observeNode";
import { prioritizeNode } from "@/src/daa/agent/nodes/prioritizeNode";
import { investigateNode } from "@/src/daa/agent/nodes/investigateNode";
import { reflectNode } from "@/src/daa/agent/nodes/reflectNode";
import { loadNextTarget } from "@/src/daa/agent/nodes/loadNextTarget";
import { reviewNode } from "@/src/daa/agent/nodes/reviewNode";
import { surfaceNode } from "@/src/daa/agent/nodes/surfaceNode";
import { learnNode } from "@/src/daa/agent/nodes/learnNode";

// ── 工具系统 V2（import 触发自注册）──
import "@/src/daa/agent/tools/index";
import { clearToolResultCache, setCurrentRunId } from "@/src/daa/agent/tools/registry";

// ── Re-export（被外部测试/API 引用的辅助函数和常量）──
export { estimateTokens, validateShape } from "@/src/daa/agent/helpers/validation";
export { DEEPSEEK_AVG_COST_PER_TOKEN } from "@/src/daa/agent/helpers/constants";

// ── Graph 组装 ──

function buildCognitiveGraph() {
  const graph = new StateGraph(CognitiveStateAnnotation)
    .addNode("observe", observeNode)
    .addNode("prioritize", prioritizeNode)
    .addNode("investigate", investigateNode)
    .addNode("reflect", reflectNode)
    .addNode("next_target", loadNextTarget)
    .addNode("review", reviewNode)
    .addNode("learn", learnNode)
    .addNode("surface", surfaceNode)
    .addEdge(START, "observe")
    .addEdge("observe", "prioritize")
    .addConditionalEdges("prioritize", (state: CognitiveState) => {
      if (state.currentTarget && state.currentThread) return "investigate";
      return "review"; // 无调查目标 → 跳到复盘
    })
    .addConditionalEdges("investigate", (state: CognitiveState) => {
      if (state.investigateResult?.thesisChanged) return "reflect";
      if (state.investigationQueue.length > 1) return "next_target";
      return "review";
    })
    .addConditionalEdges("reflect", (state: CognitiveState) => {
      if (state.investigationQueue.length > 1) return "next_target";
      return "review";
    })
    .addConditionalEdges("next_target", (state: CognitiveState) => {
      if (state.currentTarget) return "investigate";
      return "review";
    })
    .addEdge("review", "learn")
    .addEdge("learn", "surface")
    .addEdge("surface", END);

  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

// ── 单例 ──

let _compiledGraph: ReturnType<typeof buildCognitiveGraph> | null = null;

export function getCognitiveGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildCognitiveGraph();
  }
  return _compiledGraph;
}

// ── 主入口 ──

/**
 * 运行一次完整的认知 Agent 循环。
 */
export async function runCognitiveAgentCycle(trigger: "scheduled" | "manual" | "event_driven" = "manual"): Promise<{
  runId: string;
  thesesUpdated: number;
  surprises: Surprise[];
  totalTokens: number;
  errors: string[];
  durationMs: number;
}> {
  const { DEEPSEEK_AVG_COST_PER_TOKEN } = await import("@/src/daa/agent/helpers/constants");
  const { createAgentRun, completeAgentRun } = await import("@/src/daa/agent/store/agentRunStore");

  const t0 = Date.now();
  const run = await createAgentRun({ trigger });
  const threadId = `cognitive-run-${run.id}`;

  // V2: 初始化 cycle 级状态
  clearToolResultCache();
  setCurrentRunId(run.id);

  try {
    const graph = getCognitiveGraph();
    const result = await graph.invoke(
      {},
      { configurable: { thread_id: threadId } },
    );

    const durationMs = Date.now() - t0;
    const totalTkn = result.totalTokens ?? 0;
    const briefing: DailyBriefing = result.briefing ?? {
      surprises: result.surprises ?? [],
      cognitionGaps: [],
      mindChangeConditions: [],
      thesesUpdated: result.thesesUpdated ?? 0,
      memoriesCreated: result.memoriesCreated ?? 0,
      totalTokens: totalTkn,
      estimatedCost: totalTkn * DEEPSEEK_AVG_COST_PER_TOKEN,
    };
    await completeAgentRun(run.id, {
      status: (result.errors?.length ?? 0) > 0 ? "completed_with_errors" : "completed",
      targetThreadIds: result.investigationQueue?.map((t: InvestigationTarget) => t.threadId).filter(Boolean) as string[] ?? [],
      toolsCalled: result.toolsCalled ?? [],
      reasoningTraces: result.reasoningTraces ?? [],
      surprises: result.surprises ?? [],
      briefing,
      totalTokens: totalTkn,
      totalCostUsd: briefing.estimatedCost,
      durationMs,
    });

    return {
      runId: run.id,
      thesesUpdated: result.thesesUpdated ?? 0,
      surprises: result.surprises ?? [],
      totalTokens: result.totalTokens ?? 0,
      errors: result.errors ?? [],
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - t0;
    await completeAgentRun(run.id, {
      status: "failed",
      durationMs,
    }).catch(err => logSwallowed("cognitiveGraph.run.completeOnError", err));

    return {
      runId: run.id,
      thesesUpdated: 0,
      surprises: [],
      totalTokens: 0,
      errors: [e instanceof Error ? e.message : String(e)],
      durationMs,
    };
  }
}
