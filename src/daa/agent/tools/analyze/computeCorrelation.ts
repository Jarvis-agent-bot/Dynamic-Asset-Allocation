/**
 * analyze/computeCorrelation — 计算资产间相关性矩阵
 *
 * 基于价格缓存获取多个资产的日收益率，计算 Pearson 相关系数。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

registerTool(
  {
    name: "compute_correlation",
    description: "计算多个资产之间的相关性矩阵（Pearson 系数）。适合发现分散化不足或意外的资产联动。",
    category: "analyze",
    parameters: {
      symbols: { type: "string", description: "逗号分隔的资产代码列表（如 AAPL,MSFT,GLD）", required: true },
      lookbackDays: { type: "number", description: "回看天数（默认 60）" },
    },
    outputSchema: {
      matrix: "object",
      highCorrelationPairs: "object",
    },
    tags: ["correlation", "diversification", "risk"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const symbolsStr = String(params.symbols || "");
    if (!symbolsStr) {
      return { toolName: "compute_correlation", category: "analyze", success: false, data: null, outputFields: {}, error: "缺少必填参数 symbols", latencyMs: Date.now() - t0 };
    }

    const symbols = symbolsStr.split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
    if (symbols.length < 2) {
      return { toolName: "compute_correlation", category: "analyze", success: false, data: null, outputFields: {}, error: "至少需要 2 个资产代码", latencyMs: Date.now() - t0 };
    }

    const lookbackDays = Number(params.lookbackDays) || 60;

    try {
      const { fetchPriceSeriesWithCache } = await import("@/src/daa/modules/marketCache/priceSeriesCache");
      const startDate = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);

      // 并行获取价格序列
      const seriesResults = await Promise.allSettled(
        symbols.map(symbol => fetchPriceSeriesWithCache({ symbol, startDate })),
      );

      // 提取日收益率
      const returnsBySymbol: Record<string, number[]> = {};
      for (let i = 0; i < symbols.length; i++) {
        const r = seriesResults[i];
        if (r.status !== "fulfilled" || !r.value?.series?.length) continue;
        const closes = r.value.series.map(p => p.close);
        if (closes.length < 10) continue;
        returnsBySymbol[symbols[i]] = closes.slice(1).map((c, j) => (c - closes[j]) / closes[j]);
      }

      const validSymbols = Object.keys(returnsBySymbol);
      if (validSymbols.length < 2) {
        return { toolName: "compute_correlation", category: "analyze", success: false, data: null, outputFields: {}, error: "有效价格数据不足 2 个资产", latencyMs: Date.now() - t0 };
      }

      // 计算相关性矩阵
      const matrix: Record<string, Record<string, number>> = {};
      const highCorrelationPairs: Array<{ a: string; b: string; corr: number }> = [];

      for (const a of validSymbols) {
        matrix[a] = {};
        for (const b of validSymbols) {
          if (a === b) {
            matrix[a][b] = 1;
            continue;
          }
          const corr = pearsonCorrelation(returnsBySymbol[a], returnsBySymbol[b]);
          matrix[a][b] = Math.round(corr * 1000) / 1000;

          if (a < b && Math.abs(corr) > 0.7) {
            highCorrelationPairs.push({ a, b, corr: matrix[a][b] });
          }
        }
      }

      highCorrelationPairs.sort((x, y) => Math.abs(y.corr) - Math.abs(x.corr));

      const data = {
        symbols: validSymbols,
        lookbackDays,
        matrix,
        highCorrelationPairs,
      };

      return {
        toolName: "compute_correlation",
        category: "analyze",
        success: true,
        data,
        outputFields: { matrix, highCorrelationPairs },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.compute_correlation", e);
      return { toolName: "compute_correlation", category: "analyze", success: false, data: null, outputFields: {}, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
    }
  },
);

/** Pearson 相关系数（对齐最短长度） */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;

  const xs = x.slice(0, n);
  const ys = y.slice(0, n);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let covXY = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  return denom > 0 ? covXY / denom : 0;
}
