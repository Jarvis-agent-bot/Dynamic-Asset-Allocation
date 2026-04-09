/**
 * POST /api/daa/agent/bootstrap — 初始化 Thesis（扫描持仓生成初始论点）
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
    const holdings = rows
      .filter(r => r.holdingQty > 0)
      .map(r => ({
        assetKey: r.assetKey,
        symbol: r.symbol,
        holdingQty: r.holdingQty,
        lastPrice: r.lastPrice,
      }));

    const result = await bootstrapTheses(holdings);
    return ok(result);
  });
}
