import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { summarizeProposalExecutionCosts } from "@/src/daa/modules/workbench/workbenchShared";

export const runtime = "nodejs";

type AllocationItem = { name: string; value: number; weightPct: number };

/**
 * POST /api/daa/workbench/rebalance/what-if
 *
 * 计算调仓前后的组合配置对比（前端不再需要自行计算）。
 * Body: { cycleId: string, selectedProposalKeys: string[] }
 */
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{
      cycleId?: string;
      selectedProposalKeys?: string[];
    }>(req);

    if (!body?.cycleId) {
      return fail("VALIDATION_FAILED", "cycleId 必填", { status: 400 });
    }

    const selectedKeys = new Set(body.selectedProposalKeys ?? []);
    const [bootstrap, systemRow] = await Promise.all([
      buildWorkbenchBootstrap({ syncPrices: false }),
      getDaaSystemConfig(),
    ]);

    // 找到对应 cycle
    const cycle = bootstrap.latestCycle?.cycleId === body.cycleId
      ? bootstrap.latestCycle
      : null;

    if (!cycle) {
      return fail("NOT_FOUND", `未找到周期 ${body.cycleId}`, { status: 404 });
    }

    const proposals = ((cycle as Record<string, unknown>).proposals as Array<{
      assetKey: string; symbol: string; side: "BUY" | "SELL";
      suggestedQty: number; price: number; selected: boolean; suggestedNotional: number;
    }> ?? []).filter((p) =>
      selectedKeys.size === 0 || selectedKeys.has(`${p.assetKey}-${p.side}`),
    );

    const baseCurrency = bootstrap.baseCurrency;
    type AssetRow = { assetKey: string; symbol: string; holdingQty: number; valuationBase: number | null; fxMissing: boolean };
    const holdings = (bootstrap.assetUniverse as AssetRow[]).filter((h) => h.holdingQty > 0);
    const cash = bootstrap.account.cash;

    // 当前配置
    const beforeItems: AllocationItem[] = [];
    let totalHoldingsValue = 0;

    for (const h of holdings) {
      const val = h.valuationBase ?? 0;
      totalHoldingsValue += val;
      beforeItems.push({ name: h.symbol, value: +val.toFixed(2), weightPct: 0 });
    }
    const beforeTotal = totalHoldingsValue + cash;
    if (cash > 0) beforeItems.push({ name: "现金", value: +cash.toFixed(2), weightPct: 0 });
    for (const item of beforeItems) item.weightPct = beforeTotal > 0 ? +(item.value / beforeTotal * 100).toFixed(2) : 0;

    // 执行后配置
    const executionConfig = getStrategyExecutionConfig(systemRow.config);
    const costSummary = summarizeProposalExecutionCosts({
      proposals,
      feeRateBps: executionConfig.feeRateBps,
      slippageBps: executionConfig.slippageBps,
    });
    const adjustments = new Map<string, number>();
    for (const row of costSummary.estimates) {
      adjustments.set(row.assetKey, (adjustments.get(row.assetKey) ?? 0) + row.assetValueDeltaBase);
    }

    const afterItems: AllocationItem[] = [];
    let afterTotalValue = 0;

    for (const h of holdings) {
      if (h.holdingQty > 0 || adjustments.has(h.assetKey)) {
        const currentVal = h.valuationBase ?? 0;
        const adj = adjustments.get(h.assetKey) ?? 0;
        const newVal = Math.max(0, currentVal + adj);
        if (newVal > 0) {
          afterTotalValue += newVal;
          afterItems.push({ name: h.symbol, value: +newVal.toFixed(2), weightPct: 0 });
        }
        adjustments.delete(h.assetKey);
      }
    }

    // 新建仓位
    for (const [assetKey, adj] of adjustments) {
      if (adj > 0) {
        const p = proposals.find((pp: { assetKey: string; symbol: string }) => pp.assetKey === assetKey);
        afterTotalValue += adj;
        afterItems.push({ name: p?.symbol ?? assetKey, value: +adj.toFixed(2), weightPct: 0 });
      }
    }

    const afterCash = cash + costSummary.netCashImpact;
    if (afterCash > 0) {
      afterTotalValue += afterCash;
      afterItems.push({ name: "现金", value: +afterCash.toFixed(2), weightPct: 0 });
    }

    for (const item of afterItems) item.weightPct = afterTotalValue > 0 ? +(item.value / afterTotalValue * 100).toFixed(2) : 0;

    // 权重变化
    const weightChanges = afterItems
      .filter((a) => a.name !== "现金")
      .map((a) => {
        const before = beforeItems.find((b) => b.name === a.name);
        return {
          name: a.name,
          beforePct: before?.weightPct ?? 0,
          afterPct: a.weightPct,
          changePct: +(a.weightPct - (before?.weightPct ?? 0)).toFixed(2),
        };
      });

    return ok({
      baseCurrency,
      selectedCount: proposals.length,
      before: beforeItems,
      after: afterItems,
      totalBuy: +costSummary.buyNotional.toFixed(2),
      totalSell: +costSummary.sellNotional.toFixed(2),
      weightChanges,
    });
  });
}
