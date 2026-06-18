/**
 * POST /api/daa/agent/bootstrap — 建立初始投资判断（扫描持仓和观察列表）
 */

export const runtime = "nodejs";
export const maxDuration = 300;

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { bootstrapTheses } from "@/src/daa/agent/bootstrap";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
    const assets = bootstrap.assetUniverse
      .map((row) => ({ row, isHeld: isVisibleHolding(row) }))
      .filter(({ row, isHeld }) => isHeld || row.watchEnabled)
      .map(({ row, isHeld }) => ({
        assetKey: row.assetKey,
        symbol: row.symbol,
        holdingQty: isHeld ? row.holdingQty : 0,
        lastPrice: row.lastPrice > 0 ? row.lastPrice : row.holdingPrice,
        role: isHeld ? "holding" as const : "watchlist" as const,
        notes: row.notes,
        tags: isHeld ? row.holdingTags : row.watchTags,
      }));

    const result = await bootstrapTheses(assets);
    return ok(result);
  });
}
