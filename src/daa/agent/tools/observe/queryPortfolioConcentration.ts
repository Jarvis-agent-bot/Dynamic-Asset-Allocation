/**
 * observe/queryPortfolioConcentration — 查询组合集中度
 *
 * 迁移自 agentToolExecutors.ts createPortfolioConcentrationExecutor
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";

registerTool(
  {
    name: "query_portfolio_concentration",
    description: "查询当前组合集中度（HHI/最大仓位占比/各资产权重分布）。无需参数。",
    category: "observe",
    parameters: {},
    outputSchema: {
      hhi: "number",
      hhiLabel: "string",
      maxPositionWeightPct: "number",
      holdingsCount: "number",
    },
    tags: ["portfolio", "concentration", "risk"],
  },
  async (_params: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    if (!ctx.portfolio || ctx.portfolio.holdings.length === 0) {
      return { toolName: "query_portfolio_concentration", category: "observe", success: false, data: null, outputFields: {}, error: "组合数据未加载或无持仓", latencyMs: Date.now() - t0 };
    }

    const weights = ctx.portfolio.holdings.map((h) => h.weightPct);
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);
    const maxWeight = Math.max(...weights);
    const topHoldings = [...ctx.portfolio.holdings]
      .sort((a, b) => b.weightPct - a.weightPct)
      .slice(0, 5)
      .map((h) => ({ symbol: h.symbol, weightPct: h.weightPct }));

    const data = {
      hhi: Math.round(hhi * 10000) / 10000,
      hhiLabel: hhi >= 0.25 ? "高度集中" : hhi >= 0.15 ? "中度集中" : "适度分散",
      maxPositionWeightPct: maxWeight,
      holdingsCount: ctx.portfolio.holdings.length,
      cashPct: ctx.portfolio.cashPct,
      totalEquity: ctx.portfolio.totalEquity,
      topHoldings,
    };
    return {
      toolName: "query_portfolio_concentration",
      category: "observe",
      success: true,
      data,
      outputFields: {
        hhi: data.hhi,
        hhiLabel: data.hhiLabel,
        maxPositionWeightPct: data.maxPositionWeightPct,
        holdingsCount: data.holdingsCount,
      },
      latencyMs: Date.now() - t0,
    };
  },
);
