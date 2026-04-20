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
import { listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";
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
};

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const hours = Math.max(1, Math.min(72, parseInt(url.searchParams.get("hours") || "24", 10) || 24));
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "30", 10) || 30));

    // 关注的 symbol 集合：持仓 + watchlist
    const assets = await listDaaAssetUniverse();
    const watchedSymbols = [...new Set(
      assets
        .filter((a) => a.holdingQty > 0 || a.watchEnabled !== false)
        .map((a) => a.symbol.trim().toUpperCase())
        .filter(Boolean),
    )];

    if (watchedSymbols.length === 0) {
      return ok({ items: [], watchedSymbols: [], hours, limit });
    }

    // 关联 signal 拿 LLM summary / majorEvent（按 symbol 聚合，合并到每条 item）
    const rows = await withDaaPgClient(async ({ query }) => {
      const res = await query<NewsItemRow>(
        `SELECT provider, symbol, title, link, published_at, fetched_at,
                source_credibility, freshness
         FROM daa_news_item_snapshot_v1
         WHERE symbol = ANY($1::text[])
           AND COALESCE(published_at, fetched_at) > NOW() - ($2 || ' hours')::interval
         ORDER BY COALESCE(published_at, fetched_at) DESC
         LIMIT $3`,
        [watchedSymbols, String(hours), limit],
      );
      return res.rows;
    });

    // 附带每个命中 symbol 的 signal summary（取最新一条），用于高亮 majorEvent
    const symbolsInResults = [...new Set(rows.map((r) => r.symbol))];
    const signalMap = new Map<string, {
      llmSummary: string | null;
      llmMajorEvent: { type: string; impact: string; description: string } | null;
      scorePct: number;
    }>();
    if (symbolsInResults.length > 0) {
      const sigRows = await withDaaPgClient(async ({ query }) => {
        const res = await query<{
          symbol: string;
          llm_summary: string | null;
          llm_major_event_json: { type: string; impact: string; description: string } | null;
          score_pct: number | string;
        }>(
          `SELECT DISTINCT ON (symbol) symbol, llm_summary, llm_major_event_json, score_pct
           FROM daa_news_signal_snapshot_v1
           WHERE symbol = ANY($1::text[])
           ORDER BY symbol, generated_at DESC`,
          [symbolsInResults],
        );
        return res.rows;
      });
      for (const s of sigRows) {
        signalMap.set(s.symbol, {
          llmSummary: s.llm_summary,
          llmMajorEvent: s.llm_major_event_json,
          scorePct: Number(s.score_pct) || 50,
        });
      }
    }

    const items = rows.map((r) => ({
      symbol: r.symbol,
      title: r.title,
      link: r.link,
      publishedAt: r.published_at ?? r.fetched_at,
      provider: r.provider,
      freshness: Number(r.freshness) || 0,
      sourceCredibility: Number(r.source_credibility) || 0,
      signalSummary: signalMap.get(r.symbol)?.llmSummary ?? null,
      majorEvent: signalMap.get(r.symbol)?.llmMajorEvent ?? null,
      scorePct: signalMap.get(r.symbol)?.scorePct ?? null,
    }));

    return ok({ items, watchedSymbols, hours, limit });
  });
}
