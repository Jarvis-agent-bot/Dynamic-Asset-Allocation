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

import { createHash } from "node:crypto";

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";

/** 与 newsProviderRouter.computeItemHashSet 保持一致：title.toLowerCase().trim() 的 sha1 前 8 位。 */
function titleHash8(title: string): string {
  return createHash("sha1").update((title || "").toLowerCase().trim()).digest("hex").slice(0, 8);
}

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
    const hours = Math.max(1, Math.min(168, parseInt(url.searchParams.get("hours") || "24", 10) || 24));
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "30", 10) || 30));
    const singleSymbol = url.searchParams.get("symbol")?.trim().toUpperCase();

    // 单 symbol 模式：资产详情页使用
    let watchedSymbols: string[];
    if (singleSymbol) {
      watchedSymbols = [singleSymbol];
    } else {
      const assets = await listDaaAssetUniverse();
      watchedSymbols = [...new Set(
        assets
          .filter((a) => a.holdingQty > 0 || a.watchEnabled !== false)
          .map((a) => a.symbol.trim().toUpperCase())
          .filter(Boolean),
      )];
    }

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

    // 附带每个命中 symbol 的 signal summary（取最新一条），用于高亮 majorEvent。
    // 注意：signal 只反映 item_hash_set 中那些 news item 的分析结果，
    // 所以只有 hash 在集合内的 item 才能继承 majorEvent/summary 标签，
    // 否则前端会把 1 条"重大"放大成多条（同 symbol 下的所有新闻都挂同一标签）。
    const symbolsInResults = [...new Set(rows.map((r) => r.symbol))];
    const signalMap = new Map<string, {
      llmSummary: string | null;
      llmMajorEvent: { type: string; impact: string; description: string } | null;
      scorePct: number;
      itemHashes: Set<string>;
    }>();
    if (symbolsInResults.length > 0) {
      const sigRows = await withDaaPgClient(async ({ query }) => {
        const res = await query<{
          symbol: string;
          llm_summary: string | null;
          llm_major_event_json: { type: string; impact: string; description: string } | null;
          score_pct: number | string;
          item_hash_set: string | null;
        }>(
          `SELECT DISTINCT ON (symbol) symbol, llm_summary, llm_major_event_json, score_pct, item_hash_set
           FROM daa_news_signal_snapshot_v1
           WHERE symbol = ANY($1::text[])
           ORDER BY symbol, generated_at DESC`,
          [symbolsInResults],
        );
        return res.rows;
      });
      for (const s of sigRows) {
        const hashes = typeof s.item_hash_set === "string" && s.item_hash_set.length > 0
          ? new Set(s.item_hash_set.split(",").map((h) => h.trim()).filter(Boolean))
          : new Set<string>();
        signalMap.set(s.symbol, {
          llmSummary: s.llm_summary,
          llmMajorEvent: s.llm_major_event_json,
          scorePct: Number(s.score_pct) || 50,
          itemHashes: hashes,
        });
      }
    }

    const items = rows.map((r) => {
      const sig = signalMap.get(r.symbol);
      const inSignal = sig ? sig.itemHashes.has(titleHash8(r.title)) : false;
      return {
        symbol: r.symbol,
        title: r.title,
        link: r.link,
        publishedAt: r.published_at ?? r.fetched_at,
        provider: r.provider,
        freshness: Number(r.freshness) || 0,
        sourceCredibility: Number(r.source_credibility) || 0,
        signalSummary: inSignal ? (sig?.llmSummary ?? null) : null,
        majorEvent: inSignal ? (sig?.llmMajorEvent ?? null) : null,
        scorePct: inSignal ? (sig?.scorePct ?? null) : null,
      };
    });

    return ok({ items, watchedSymbols, hours, limit });
  });
}
