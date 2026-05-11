/**
 * observe/fetchHumanSignal — 获取人因信号（基金经理持仓）
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function makeResult(success: boolean, data: unknown, outputFields: Record<string, unknown>, t0: number, error?: string): ToolResultV2 {
  return { toolName: "fetch_human_signal", category: "observe", success, data, outputFields, error, latencyMs: Date.now() - t0 };
}

registerTool(
  {
    name: "fetch_human_signal",
    description: "获取指定资产的人因信号（基金经理持仓变动/立场/质量评分/信念强度）。适合判断机构动向。",
    category: "observe",
    parameters: {
      symbol: { type: "string", description: "资产代码", required: true },
    },
    outputSchema: {
      aggregatedScorePct: "number",
      stance: "string",
      convictionPct: "number",
    },
    tags: ["human", "signal", "institutional"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const symbol = String(params.symbol || "");
    if (!symbol) return makeResult(false, null, {}, t0, "缺少必填参数 symbol");

    try {
      const { getLatestHumanSignalBatch } = await import("@/src/daa/hf/hfService");
      const batch = await getLatestHumanSignalBatch({ symbols: [symbol], autoIngestOnMiss: false });
      const signals = batch.signals?.filter((s) => s.symbol === symbol) ?? [];

      if (signals.length === 0) {
        return makeResult(true, { symbol, hasData: false, message: `${symbol} 无人因信号数据` }, { symbol, hasData: false }, t0);
      }

      const sig = signals[0];
      const data = {
        symbol: sig.symbol,
        aggregatedScorePct: sig.aggregatedScorePct,
        convictionPct: sig.convictionPct,
        stance: sig.stance,
        momentumRegime: sig.momentumRegime,
        evidenceCount: sig.evidenceCount,
        riskTags: sig.riskTags,
      };
      return makeResult(true, data, {
        aggregatedScorePct: sig.aggregatedScorePct,
        stance: sig.stance,
        convictionPct: sig.convictionPct,
        symbol,
      }, t0);
    } catch (e) {
      logSwallowed("toolV2.fetch_human_signal", e);
      return makeResult(false, null, {}, t0, e instanceof Error ? e.message : String(e));
    }
  },
);
