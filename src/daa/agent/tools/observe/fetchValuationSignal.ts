/**
 * observe/fetchValuationSignal — 获取资产估值信号
 *
 * 迁移自 agentToolExecutors.ts executeFetchValuationSignal
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function makeResult(success: boolean, data: unknown, outputFields: Record<string, unknown>, t0: number, error?: string): ToolResultV2 {
  return { toolName: "fetch_valuation_signal", category: "observe", success, data, outputFields, error, latencyMs: Date.now() - t0 };
}

registerTool(
  {
    name: "fetch_valuation_signal",
    description: "获取指定资产的估值信号（PE/PB/股息率/价格百分位/Z-score）。适合判断是否被低估或高估。",
    category: "observe",
    parameters: {
      symbol: { type: "string", description: "资产代码", required: true },
    },
    outputSchema: {
      scorePct: "number",
      temperature: "string",
    },
    tags: ["valuation", "signal", "fundamental"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const symbol = String(params.symbol || "");
    if (!symbol) return makeResult(false, null, {}, t0, "缺少必填参数 symbol");

    try {
      const { buildValuationSignalForSymbol } = await import("@/src/daa/signals/valuationSignal");
      const signal = await buildValuationSignalForSymbol(symbol);
      if (!signal) return makeResult(false, null, {}, t0, `${symbol} 无估值信号数据`);

      const data = {
        scorePct: signal.scorePct,
        temperature: signal.temperature,
        metrics: signal.metrics,
        reasons: signal.reasons,
      };
      return makeResult(true, data, {
        scorePct: signal.scorePct,
        temperature: signal.temperature,
        symbol,
      }, t0);
    } catch (e) {
      logSwallowed("toolV2.fetch_valuation_signal", e);
      return makeResult(false, null, {}, t0, e instanceof Error ? e.message : String(e));
    }
  },
);
