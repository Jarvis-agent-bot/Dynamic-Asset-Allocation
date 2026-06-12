/**
 * GET /api/daa/news/intelligence
 *
 * 只读新闻智能层：事件图、组合影响、候选发现。
 * 注意：候选发现只是复核线索，不会自动加入观察列表或触发交易。
 */

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  listDaaDiscoveryCandidates,
  listLatestDaaNewsEventGraphs,
  listLatestDaaNewsPortfolioImpacts,
} from "@/src/daa/store/marketCacheStore";

export const runtime = "nodejs";

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const symbols = parseCsv(url.searchParams.get("symbols") || url.searchParams.get("symbol"));
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "30", 10) || 30));
    const [eventGraphs, portfolioImpacts, discoveryCandidates] = await Promise.all([
      listLatestDaaNewsEventGraphs({ symbols, limit }),
      listLatestDaaNewsPortfolioImpacts({ symbols, limit }),
      listDaaDiscoveryCandidates({ statuses: ["new", "watching"], limit }),
    ]);

    return ok({
      eventGraphs,
      portfolioImpacts,
      discoveryCandidates,
      generatedAt: new Date().toISOString(),
      policy: {
        canAutoMutateWatchlist: false,
        canAutoTrade: false,
        note: "候选发现仅用于研究和人工确认。",
      },
    });
  });
}
