/**
 * GET /api/daa/news/recent
 *
 * 读取最近 N 小时、命中持仓或 watchlist 的新闻 items，用于 Today 页的
 * "实时新闻流"面板。
 *
 * Query params:
 *   - hours: 回溯小时数，默认 24，最大 72
 *   - limit: 返回条数，默认 30，最大 200
 */

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { ensureDaaMarketCacheSchemaPg } from "@/src/daa/store/daaStorePg";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";

export const runtime = "nodejs";

type NewsItemRow = {
  provider: string;
  symbol: string;
  title: string;
  link: string | null;
  published_at: string | null;
  fetched_at: string;
  source_credibility: number;
  freshness: number;
  llm_summary: string | null;
  llm_major_event_json: { type: string; impact: string; description: string } | null;
  llm_action_hint: string | null;
  score_pct: number | string | null;
  confidence_pct: number | string | null;
};

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const hours = Math.max(1, Math.min(168, parseInt(url.searchParams.get("hours") || "24", 10) || 24));
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "30", 10) || 30));
    const singleSymbol = url.searchParams.get("symbol")?.trim().toUpperCase();
    await ensureDaaMarketCacheSchemaPg();

    // 单 symbol 模式：资产详情页使用
    let watchedSymbols: string[];
    if (singleSymbol) {
      watchedSymbols = [singleSymbol];
    } else {
      const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
      watchedSymbols = [...new Set(
        bootstrap.assetUniverse
          .filter((a) => isVisibleHolding(a) || a.watchEnabled !== false)
          .map((a) => a.symbol.trim().toUpperCase())
          .filter(Boolean),
      )];
    }

    if (watchedSymbols.length === 0) {
      return ok({ items: [], watchedSymbols: [], hours, limit });
    }

    // 关联事件层拿 LLM summary / majorEvent。事件层按 item_hash 绑定，避免把同一个
    // symbol 的一次重大新闻误贴到该 symbol 的所有新闻上。
    const rows = await withDaaPgClient(async ({ query }) => {
      const res = await query<NewsItemRow>(
        `SELECT i.provider, i.symbol, i.title, i.link, i.published_at, i.fetched_at,
                i.source_credibility, i.freshness,
                e.llm_summary, e.llm_major_event_json, e.llm_action_hint, e.score_pct, e.confidence_pct
         FROM daa_news_item_snapshot_v1 i
         LEFT JOIN LATERAL (
           SELECT llm_summary, llm_major_event_json, llm_action_hint, score_pct, confidence_pct
           FROM daa_news_event_snapshot_v1 e
           WHERE e.symbol = i.symbol
             AND e.item_hash = i.item_hash
           ORDER BY e.analyzed_at DESC
           LIMIT 1
         ) e ON TRUE
         WHERE i.symbol = ANY($1::text[])
           AND COALESCE(i.published_at, i.fetched_at) > NOW() - ($2 || ' hours')::interval
         ORDER BY COALESCE(i.published_at, i.fetched_at) DESC
         LIMIT $3`,
        [watchedSymbols, String(hours), limit],
      );
      return res.rows;
    });

    const items = rows.map((r) => ({
      symbol: r.symbol,
      title: r.title,
      link: r.link,
      publishedAt: r.published_at ?? r.fetched_at,
      provider: r.provider,
      freshness: Number(r.freshness) || 0,
      sourceCredibility: Number(r.source_credibility) || 0,
      signalSummary: r.llm_summary ?? null,
      majorEvent: r.llm_major_event_json ?? null,
      actionHint: r.llm_action_hint ?? null,
      scorePct: r.score_pct == null ? null : Number(r.score_pct) || null,
      confidencePct: r.confidence_pct == null ? null : Number(r.confidence_pct) || null,
    }));

    return ok({ items, watchedSymbols, hours, limit });
  });
}
