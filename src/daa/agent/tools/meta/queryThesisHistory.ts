/**
 * meta/queryThesisHistory — 查询论点完整历史
 *
 * 包含 conviction 变化轨迹、证据链、复盘记录。
 * 用于 Agent 自省和决策回顾。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

registerTool(
  {
    name: "query_thesis_history",
    description: "查询指定论点的完整历史（证据链、conviction 变化、复盘记录）。适合回顾过去的判断依据和演化过程。",
    category: "meta",
    parameters: {
      threadId: { type: "string", description: "论点 ID", required: true },
    },
    outputSchema: {
      evidenceCount: "number",
      currentConviction: "string",
      daysSinceCreation: "number",
    },
    tags: ["thesis", "history", "self-reflection"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const threadId = String(params.threadId || "");
    if (!threadId) {
      return { toolName: "query_thesis_history", category: "meta", success: false, data: null, outputFields: {}, error: "缺少必填参数 threadId", latencyMs: Date.now() - t0 };
    }

    try {
      const thesisStore = await import("@/src/daa/agent/store/thesisStore");

      const result = await thesisStore.getThesisWithEvidence(threadId);
      if (!result) {
        return { toolName: "query_thesis_history", category: "meta", success: false, data: null, outputFields: {}, error: `论点 ${threadId} 不存在`, latencyMs: Date.now() - t0 };
      }

      const { thread, evidence } = result;
      const accuracyAvg = await thesisStore.getThesisAccuracyAvg(threadId);

      // 按时间排序证据
      const sortedEvidence = [...evidence].sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      // conviction 变化轨迹（从证据中推断）
      const convictionChanges = sortedEvidence
        .filter(e => e.source === "agent_reasoning")
        .slice(-10)
        .map(e => ({
          date: e.createdAt,
          evidenceType: e.evidenceType,
          summary: e.content.slice(0, 150),
        }));

      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(thread.createdAt).getTime()) / 86400000,
      );

      const data = {
        thread: {
          id: thread.id,
          title: thread.title,
          status: thread.status,
          conviction: thread.conviction,
          thesisText: thread.thesisText,
          assetKeys: thread.assetKeys,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
        },
        evidenceCount: evidence.length,
        evidenceByType: {
          supporting: evidence.filter(e => e.evidenceType === "supporting").length,
          contradicting: evidence.filter(e => e.evidenceType === "contradicting").length,
          neutral: evidence.filter(e => e.evidenceType === "neutral").length,
        },
        convictionChanges,
        accuracyAvg,
        daysSinceCreation,
      };

      return {
        toolName: "query_thesis_history",
        category: "meta",
        success: true,
        data,
        outputFields: {
          evidenceCount: data.evidenceCount,
          currentConviction: thread.conviction,
          daysSinceCreation,
          accuracyAvg,
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.query_thesis_history", e);
      return { toolName: "query_thesis_history", category: "meta", success: false, data: null, outputFields: {}, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
    }
  },
);
