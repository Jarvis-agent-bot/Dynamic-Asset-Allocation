/**
 * observe/queryMarketRegime — 查询当前市场环境
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";

registerTool(
  {
    name: "query_market_regime",
    description: "查询当前市场环境（regime/VIX/各区域风险评分/宏观周期阶段）。无需参数。",
    category: "observe",
    parameters: {},
    outputSchema: {
      regime: "string",
      vix: "number",
    },
    tags: ["market", "regime", "macro"],
  },
  async (_params: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    if (!ctx.market) {
      return { toolName: "query_market_regime", category: "observe", success: false, data: null, outputFields: {}, error: "市场数据未加载", latencyMs: Date.now() - t0 };
    }
    const data = {
      regime: ctx.market.regime,
      vix: ctx.market.vix,
      indicators: ctx.market.indicators,
      sessions: ctx.market.sessions ?? [],
    };
    return {
      toolName: "query_market_regime",
      category: "observe",
      success: true,
      data,
      outputFields: {
        regime: ctx.market.regime,
        vix: ctx.market.vix,
        openMarkets: (ctx.market.sessions ?? []).filter((row) => row.isOpen).map((row) => row.market),
      },
      latencyMs: Date.now() - t0,
    };
  },
);
