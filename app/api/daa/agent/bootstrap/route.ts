/**
 * POST /api/daa/agent/bootstrap — 建立初始投资判断（扫描持仓和观察列表）
 */

export const runtime = "nodejs";
export const maxDuration = 300;

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { bootstrapTheses } from "@/src/daa/agent/bootstrap";
import { listDaaAssetUniverse } from "@/src/daa/store/assetUniverseStore";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const rows = await listDaaAssetUniverse();
    const assets = rows
      .filter(r => r.holdingQty > 0 || r.watchEnabled)
      .map(r => ({
        assetKey: r.assetKey,
        symbol: r.symbol,
        holdingQty: r.holdingQty,
        lastPrice: r.lastPrice > 0 ? r.lastPrice : r.holdingPrice,
        role: r.holdingQty > 0 ? "holding" as const : "watchlist" as const,
        notes: r.notes,
        tags: r.holdingQty > 0 ? r.holdingTags : r.watchTags,
      }));

    const result = await bootstrapTheses(assets);
    return ok(result);
  });
}
