/**
 * observe/fetchTechnicalSignal — 获取资产技术信号
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function makeResult(success: boolean, data: unknown, outputFields: Record<string, unknown>, t0: number, error?: string): ToolResultV2 {
  return { toolName: "fetch_technical_signal", category: "observe", success, data, outputFields, error, latencyMs: Date.now() - t0 };
}

registerTool(
  {
    name: "fetch_technical_signal",
    description: "获取指定资产的技术信号（SMA/RSI/MACD/波动率/动量等）。适合判断趋势强度和短期方向。",
    category: "observe",
    parameters: {
      symbol: { type: "string", description: "资产代码（如 AAPL, 0700.HK）", required: true },
    },
    outputSchema: {
      scorePct: "number",
      momentumRegime: "string",
    },
    tags: ["technical", "signal", "trend"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const symbol = String(params.symbol || "");
    if (!symbol) return makeResult(false, null, {}, t0, "缺少必填参数 symbol");

    try {
      const { buildTechnicalSignalForSymbol } = await import("@/src/daa/signals/technicalSignal");
      const signal = await buildTechnicalSignalForSymbol(symbol);
      if (!signal) return makeResult(false, null, {}, t0, `${symbol} 无技术信号数据`);

      const data = {
        scorePct: signal.scorePct,
        momentumRegime: signal.momentumRegime,
        metrics: signal.metrics,
        reasons: signal.reasons,
      };
      return makeResult(true, data, {
        scorePct: signal.scorePct,
        momentumRegime: signal.momentumRegime,
        symbol,
      }, t0);
    } catch (e) {
      logSwallowed("toolV2.fetch_technical_signal", e);
      return makeResult(false, null, {}, t0, e instanceof Error ? e.message : String(e));
    }
  },
);
