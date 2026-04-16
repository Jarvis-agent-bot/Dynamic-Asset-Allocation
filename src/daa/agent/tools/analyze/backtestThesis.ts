/**
 * analyze/backtestThesis — 回测论点相关资产的历史表现
 *
 * 基于 thesis 的 assetKeys，获取价格序列并计算归因。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

registerTool(
  {
    name: "backtest_thesis",
    description: "回测指定资产在过去 N 天的表现（收益率、波动率、最大回撤）。适合验证论点的历史有效性。",
    category: "analyze",
    parameters: {
      symbol: { type: "string", description: "资产代码", required: true },
      lookbackDays: { type: "number", description: "回看天数（默认 90）" },
    },
    outputSchema: {
      totalReturn: "number",
      annualizedVol: "number",
      maxDrawdown: "number",
      sharpeApprox: "number",
    },
    tags: ["backtest", "performance", "history"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const symbol = String(params.symbol || "");
    if (!symbol) {
      return { toolName: "backtest_thesis", category: "analyze", success: false, data: null, outputFields: {}, error: "缺少必填参数 symbol", latencyMs: Date.now() - t0 };
    }

    const lookbackDays = Number(params.lookbackDays) || 90;

    try {
      const { fetchPriceSeriesWithCache } = await import("@/src/daa/modules/marketCache/priceSeriesCache");
      const startDate = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
      const result = await fetchPriceSeriesWithCache({ symbol, startDate });

      if (!result?.series?.length || result.series.length < 5) {
        return { toolName: "backtest_thesis", category: "analyze", success: false, data: null, outputFields: {}, error: `${symbol} 价格数据不足（需至少 5 个数据点）`, latencyMs: Date.now() - t0 };
      }

      const closes = result.series.map(p => p.close);
      const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);

      // 总收益
      const totalReturn = (closes[closes.length - 1] - closes[0]) / closes[0];

      // 年化波动率
      const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / returns.length;
      const dailyVol = Math.sqrt(variance);
      const annualizedVol = dailyVol * Math.sqrt(252);

      // 最大回撤
      let peak = closes[0];
      let maxDrawdown = 0;
      for (const c of closes) {
        if (c > peak) peak = c;
        const dd = (peak - c) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      // 近似 Sharpe（无风险利率假设 4%）
      const annualizedReturn = totalReturn * (252 / closes.length);
      const sharpeApprox = annualizedVol > 0 ? (annualizedReturn - 0.04) / annualizedVol : 0;

      const data = {
        symbol,
        lookbackDays,
        dataPoints: closes.length,
        totalReturn: Math.round(totalReturn * 10000) / 10000,
        annualizedVol: Math.round(annualizedVol * 10000) / 10000,
        maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
        sharpeApprox: Math.round(sharpeApprox * 100) / 100,
        startPrice: closes[0],
        endPrice: closes[closes.length - 1],
      };

      return {
        toolName: "backtest_thesis",
        category: "analyze",
        success: true,
        data,
        outputFields: {
          totalReturn: data.totalReturn,
          annualizedVol: data.annualizedVol,
          maxDrawdown: data.maxDrawdown,
          sharpeApprox: data.sharpeApprox,
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.backtest_thesis", e);
      return { toolName: "backtest_thesis", category: "analyze", success: false, data: null, outputFields: {}, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
    }
  },
);
