/**
 * act/suggestTargetWeight — 基于量化策略建议目标权重
 *
 * 包装 ensemble strategy，根据当前市场数据计算建议权重。
 * 需要审批确认（requiresApproval: true）。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

registerTool(
  {
    name: "suggest_target_weight",
    description: "基于量化策略（等权/动量/风险平价）为指定资产组合计算建议目标权重。输出仅为建议，不自动执行。",
    category: "act",
    parameters: {
      symbols: { type: "string", description: "逗号分隔的资产代码列表", required: true },
      strategy: { type: "string", description: "策略类型: equalWeight / momentum / riskParity（默认 equalWeight）" },
    },
    outputSchema: {
      weights: "object",
      strategy: "string",
    },
    requiresApproval: true,
    tags: ["weight", "allocation", "strategy"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const symbolsStr = String(params.symbols || "");
    if (!symbolsStr) {
      return { toolName: "suggest_target_weight", category: "act", success: false, data: null, outputFields: {}, error: "缺少必填参数 symbols", latencyMs: Date.now() - t0 };
    }

    const symbols = symbolsStr.split(",").map(s => s.trim()).filter(Boolean);
    const strategy = String(params.strategy || "equalWeight");

    try {
      const { buildEqualWeightTargetWeights, buildMomentumTargetWeights, buildRiskParityTargetWeights } =
        await import("@/src/core/ensemble/strategy");

      let weights: Record<string, number>;

      if (strategy === "momentum") {
        // 需要收益率数据
        const { fetchPriceSeriesWithCache } = await import("@/src/daa/modules/marketCache/priceSeriesCache");
        const startDate = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
        const returnsBySymbol: Record<string, number> = {};

        for (const sym of symbols) {
          try {
            const result = await fetchPriceSeriesWithCache(sym, startDate);
            if (result?.data?.length && result.data.length >= 2) {
              const closes = result.data.map((p: { close: number }) => p.close);
              returnsBySymbol[sym] = (closes[closes.length - 1] - closes[0]) / closes[0];
            }
          } catch (e) {
            logSwallowed(`toolV2.suggest_target_weight.price.${sym}`, e);
          }
        }
        weights = buildMomentumTargetWeights(returnsBySymbol);
      } else if (strategy === "riskParity") {
        // 需要波动率数据
        const { fetchPriceSeriesWithCache } = await import("@/src/daa/modules/marketCache/priceSeriesCache");
        const startDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const volBySymbol: Record<string, number> = {};

        for (const sym of symbols) {
          try {
            const result = await fetchPriceSeriesWithCache(sym, startDate);
            if (result?.data?.length && result.data.length >= 10) {
              const closes = result.data.map((p: { close: number }) => p.close);
              const rets: number[] = closes.slice(1).map((c: number, i: number) => (c - closes[i]) / closes[i]);
              const mean = rets.reduce((a: number, b: number) => a + b, 0) / rets.length;
              const variance = rets.reduce((sum: number, r: number) => sum + (r - mean) ** 2, 0) / rets.length;
              volBySymbol[sym] = Math.sqrt(variance) * Math.sqrt(252);
            }
          } catch (e) {
            logSwallowed(`toolV2.suggest_target_weight.vol.${sym}`, e);
          }
        }
        weights = buildRiskParityTargetWeights(volBySymbol);
      } else {
        weights = buildEqualWeightTargetWeights(symbols);
      }

      // 格式化为百分比
      const formattedWeights = Object.fromEntries(
        Object.entries(weights).map(([k, v]) => [k, Math.round(v * 10000) / 100]),
      );

      const data = {
        strategy,
        symbols,
        weights: formattedWeights,
        note: "建议仅供参考，需要人工确认后执行",
      };

      return {
        toolName: "suggest_target_weight",
        category: "act",
        success: true,
        data,
        outputFields: { weights: formattedWeights, strategy },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.suggest_target_weight", e);
      return { toolName: "suggest_target_weight", category: "act", success: false, data: null, outputFields: {}, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
    }
  },
);
