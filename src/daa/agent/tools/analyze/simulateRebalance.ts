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
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();

    try {
      const { rebalanceCore } = await import("@/src/core/rebalanceCore");
      const { isVisibleHolding } = await import("@/src/daa/modules/portfolio/holdingVisibility");
      const { buildWorkbenchBootstrap } = await import("@/src/daa/modules/workbench/workbenchReadService");

      const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
      const assetRows = bootstrap.assetUniverse.filter((row) => isVisibleHolding(row) || row.targetWeightPct > 0);
      const assetsWithTarget = assetRows.filter((row) => row.targetWeightPct > 0);
      if (!assetRows.length) {
        return { toolName: "simulate_rebalance", category: "analyze", success: false, data: null, outputFields: {}, error: "无可模拟的持仓或目标配置", latencyMs: Date.now() - t0 };
      }
      if (!assetsWithTarget.length) {
        return { toolName: "simulate_rebalance", category: "analyze", success: false, data: null, outputFields: {}, error: "未设置目标权重", latencyMs: Date.now() - t0 };
      }

      // 构建 rebalanceCore 请求
      const holdings = Object.fromEntries(
        assetRows
          .filter(isVisibleHolding)
          .map((row) => [row.symbol, row.holdingQty]),
      );
      const prices = Object.fromEntries(
        assetRows.map((row) => [row.symbol, row.lastPrice > 0 ? row.lastPrice : row.holdingPrice]),
      );
      const targetWeights = Object.fromEntries(
        assetsWithTarget.map((row) => [row.symbol, row.targetWeightPct / 100]),
      );

      const driftThresholdPct = Number(params.driftThresholdPct) || 5;

      const result = rebalanceCore({
        account: {
          cash: bootstrap.account.cash,
          totalEquity: bootstrap.account.totalEquity == null ? undefined : bootstrap.account.totalEquity,
        },
        holdings,
        prices,
        targetWeights,
        constraints: { maxPositionPct: 0.30 },
        trigger: { driftThresholdPct: driftThresholdPct / 100 },
      });

      const orderCount = result.orders?.length ?? 0;
      const totalTurnover = (result.orders ?? []).reduce((sum: number, o) => sum + Math.abs(o.notional ?? 0), 0);

      const data = {
        shouldRebalance: result.trigger?.shouldRebalance ?? false,
        triggerReason: result.trigger?.reasons?.join("; ") ?? "N/A",
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
