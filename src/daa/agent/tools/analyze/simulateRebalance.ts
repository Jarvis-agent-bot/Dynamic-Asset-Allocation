/**
 * analyze/simulateRebalance — 模拟再平衡（dry-run）
 *
 * 包装 rebalanceCore() 进行模拟调仓，不实际执行。
 * 展示预期订单、资金流向、触发条件。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

registerTool(
  {
    name: "simulate_rebalance",
    description: "模拟再平衡操作（不实际执行）。展示预期订单和资金流向。适合评估调仓方案的合理性。",
    category: "analyze",
    parameters: {
      driftThresholdPct: { type: "number", description: "漂移阈值百分比（默认使用系统配置）" },
    },
    outputSchema: {
      shouldRebalance: "boolean",
      orderCount: "number",
      totalTurnover: "number",
    },
    tags: ["rebalance", "simulation", "portfolio"],
  },
  async (params: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();

    if (!ctx.portfolio || ctx.portfolio.holdings.length === 0) {
      return { toolName: "simulate_rebalance", category: "analyze", success: false, data: null, outputFields: {}, error: "无持仓数据", latencyMs: Date.now() - t0 };
    }

    try {
      const { rebalanceCore } = await import("@/src/core/rebalanceCore");
      const { listDaaAssetUniverse } = await import("@/src/daa/store/assetUniverseStore");

      // 从 asset universe 读取目标权重（targetWeightHint 字段，百分比形式 0-100）
      const allAssets = await listDaaAssetUniverse();
      const assetsWithTarget = allAssets.filter(a => a.targetWeightHint > 0);
      if (!assetsWithTarget.length) {
        return { toolName: "simulate_rebalance", category: "analyze", success: false, data: null, outputFields: {}, error: "未设置目标权重", latencyMs: Date.now() - t0 };
      }

      // 构建 rebalanceCore 请求
      const holdings = Object.fromEntries(
        ctx.portfolio.holdings.map(h => [h.symbol, h.holdingQty]),
      );
      const prices = Object.fromEntries(
        ctx.portfolio.holdings.map(h => [h.symbol, h.lastPrice]),
      );
      const targetWeights = Object.fromEntries(
        assetsWithTarget.map(a => [a.symbol, a.targetWeightHint / 100]),
      );

      const driftThresholdPct = Number(params.driftThresholdPct) || 5;

      const result = rebalanceCore({
        account: { cash: ctx.portfolio.totalEquity * ctx.portfolio.cashPct },
        holdings,
        prices,
        targets: targetWeights,
        constraints: { maxPositionPct: 0.30 },
        policy: { thresholdPct: driftThresholdPct / 100 },
      });

      const orderCount = result.orders?.length ?? 0;
      const totalTurnover = (result.orders ?? []).reduce((sum, o) => sum + Math.abs(o.notional ?? 0), 0);

      const data = {
        shouldRebalance: result.trigger?.shouldRebalance ?? false,
        triggerReason: result.trigger?.reason ?? "N/A",
        orderCount,
        orders: (result.orders ?? []).slice(0, 10).map(o => ({
          symbol: o.symbol,
          side: o.side,
          notional: Math.round((o.notional ?? 0) * 100) / 100,
        })),
        totalTurnover: Math.round(totalTurnover * 100) / 100,
        warnings: result.warnings ?? [],
      };

      return {
        toolName: "simulate_rebalance",
        category: "analyze",
        success: true,
        data,
        outputFields: {
          shouldRebalance: data.shouldRebalance,
          orderCount: data.orderCount,
          totalTurnover: data.totalTurnover,
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.simulate_rebalance", e);
      return { toolName: "simulate_rebalance", category: "analyze", success: false, data: null, outputFields: {}, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
    }
  },
);
