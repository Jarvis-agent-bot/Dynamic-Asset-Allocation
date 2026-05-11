import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  listMarketIndicatorHistorySeries,
} from "@/src/daa/modules/marketContext/marketIndicatorService";
import type { DaaMarketIndicatorKey, DaaMarketIndicatorScope } from "@/src/daa/modules/marketContext/marketContextTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KEYS = new Set<DaaMarketIndicatorKey>([
  "vix",
  "qqq_spy_ratio",
  "fxi_volatility",
  "kweb_fxi_ratio",
  "btc_eth_ratio",
  "btc_volatility",
  "gold_silver_ratio",
]);

const VALID_SCOPES = new Set<DaaMarketIndicatorScope>([
  "us_equity",
  "hk_cn_equity",
  "crypto",
  "macro_defensive",
]);

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const url = new URL(req.url);
    const keys = String(url.searchParams.get("keys") || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is DaaMarketIndicatorKey => VALID_KEYS.has(item as DaaMarketIndicatorKey));
    if (!keys.length) {
      return fail("VALIDATION_FAILED", "keys is required", { status: 400 });
    }
    const days = Math.max(1, Math.min(365, Math.trunc(Number(url.searchParams.get("days") || 90) || 90)));
    const scopeParam = String(url.searchParams.get("scope") || "").trim();
    const scope = VALID_SCOPES.has(scopeParam as DaaMarketIndicatorScope)
      ? scopeParam as DaaMarketIndicatorScope
      : undefined;

    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const history = await listMarketIndicatorHistorySeries({ keys, days, scope });
    return ok({ keys, days, scope: scope || null, history, at: new Date().toISOString() });
  });
}
