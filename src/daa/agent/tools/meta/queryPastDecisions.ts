/**
 * meta/queryPastDecisions — 查询历史 Agent 决策记录
 *
 * 从 daa_agent_runs 读取历史运行的推理轨迹和工具调用模式。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

registerTool(
  {
    name: "query_past_decisions",
    description: "查询最近 N 次 Agent 运行的决策摘要（调查了哪些论点、使用了哪些工具、得出什么结论）。适合检视决策模式和发现盲区。",
    category: "meta",
    parameters: {
      limit: { type: "number", description: "返回最近 N 次运行（默认 5）" },
    },
    outputSchema: {
      runCount: "number",
      avgTokens: "number",
      toolUsagePattern: "object",
    },
    tags: ["decisions", "history", "self-reflection"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const limit = Math.min(Number(params.limit) || 5, 20);

    try {
      const { query } = await import("@/src/daa/pg/pool");

      const rows = await query<{
        id: string;
        trigger: string;
        status: string;
        target_thread_ids: string[];
        tools_called: unknown;
        briefing: unknown;
        total_tokens: number;
        total_cost_usd: number;
        duration_ms: number;
        created_at: string;
      }>(
        `SELECT id, trigger, status, target_thread_ids, tools_called, briefing,
                total_tokens, total_cost_usd, duration_ms, created_at
         FROM daa_agent_runs
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      );

      if (!rows.length) {
        return { toolName: "query_past_decisions", category: "meta", success: true, data: { message: "无历史运行记录", runs: [] }, outputFields: { runCount: 0 }, latencyMs: Date.now() - t0 };
      }

      // 统计工具使用频次
      const toolUsage: Record<string, number> = {};
      let totalTokens = 0;

      const runSummaries = rows.map(r => {
        const tools = Array.isArray(r.tools_called) ? r.tools_called as Array<{ tool: string }> : [];
        for (const tc of tools) {
          if (tc.tool) toolUsage[tc.tool] = (toolUsage[tc.tool] ?? 0) + 1;
        }
        totalTokens += r.total_tokens ?? 0;

        const briefing = r.briefing as Record<string, unknown> | null;
        return {
          id: r.id,
          trigger: r.trigger,
          status: r.status,
          targetCount: r.target_thread_ids?.length ?? 0,
          toolsUsed: tools.map(t => t.tool).filter(Boolean),
          thesesUpdated: (briefing?.thesesUpdated as number) ?? 0,
          surpriseCount: Array.isArray(briefing?.surprises) ? (briefing.surprises as unknown[]).length : 0,
          tokens: r.total_tokens,
          durationMs: r.duration_ms,
          date: r.created_at,
        };
      });

      // 按使用频次排序
      const toolUsagePattern = Object.entries(toolUsage)
        .sort((a, b) => b[1] - a[1])
        .map(([tool, count]) => ({ tool, count }));

      const data = {
        runCount: rows.length,
        runs: runSummaries,
        toolUsagePattern,
        avgTokens: Math.round(totalTokens / rows.length),
      };

      return {
        toolName: "query_past_decisions",
        category: "meta",
        success: true,
        data,
        outputFields: {
          runCount: data.runCount,
          avgTokens: data.avgTokens,
          toolUsagePattern,
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.query_past_decisions", e);
      return { toolName: "query_past_decisions", category: "meta", success: false, data: null, outputFields: {}, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
    }
  },
);
