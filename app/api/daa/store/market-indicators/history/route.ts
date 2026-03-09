import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import {
  listMarketIndicatorHistorySeriesV1,
} from "@/src/daa/modules/marketContext/marketIndicatorServiceV1";
import type { DaaMarketIndicatorKeyV1, DaaMarketIndicatorScopeV1 } from "@/src/daa/modules/marketContext/marketContextTypesV1";

export const runtime = "nodejs";

const VALID_KEYS = new Set<DaaMarketIndicatorKeyV1>([
  "vix",
  "qqq_spy_ratio",
  "fxi_volatility",
  "kweb_fxi_ratio",
  "btc_eth_ratio",
  "btc_volatility",
  "gold_silver_ratio",
]);

const VALID_SCOPES = new Set<DaaMarketIndicatorScopeV1>([
  "us_equity",
  "hk_cn_equity",
  "crypto",
  "macro_defensive",
]);

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const keys = String(url.searchParams.get("keys") || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is DaaMarketIndicatorKeyV1 => VALID_KEYS.has(item as DaaMarketIndicatorKeyV1));
    if (!keys.length) {
      return failV1("VALIDATION_FAILED", "keys is required", { status: 400 });
    }
    const days = Math.max(1, Math.min(365, Math.trunc(Number(url.searchParams.get("days") || 90) || 90)));
    const scopeParam = String(url.searchParams.get("scope") || "").trim();
    const scope = VALID_SCOPES.has(scopeParam as DaaMarketIndicatorScopeV1)
      ? scopeParam as DaaMarketIndicatorScopeV1
      : undefined;
    const history = await listMarketIndicatorHistorySeriesV1({ keys, days, scope });
    return okV1({ keys, days, scope: scope || null, history, at: new Date().toISOString() });
  });
}
