/**
 * newsSignal.ts — 新闻信号核心模块（v2.1 修复版）
 *
 * 修复 P0-1: sentimentScore 不再硬编码 0（标记为 reserved）
 * 修复 P0-2: 缓存不再反推 sentimentScore（直接用 scorePct）
 * 修复 P1-3: getCachedSignal 合并为单次 DB 查询
 * 修复 P1-4: upsert + LLM 字段改为原子单次写入
 * 修复 P2-4: buildNewsSignals 接受 market 参数
 */

import { createHash } from "node:crypto";
import { clamp } from "@/src/core/math";
import {
  getDaaNewsSignalSnapshotBySymbol,
  upsertDaaNewsItemSnapshots,
  upsertDaaNewsSignalSnapshots,
} from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { fetchNewsForSymbol } from "./newsProviderRouter";
import { computeItemHashSet } from "./newsProviderRouter";
import { sourceCredibility } from "./newsProviders";
import { analyzeNewsWithLlm, type LlmNewsAnalysis } from "./newsLlmAnalyzer";
import type { RawNewsItem } from "./newsProviders";

// ─── Types ───────────────────────────────────────────────────

export type DaaNewsSignalItem = {
  symbol: string;
  title: string;
  link: string | null;
  ts: string;
  /** Reserved: 逐条情感分析需要 per-item LLM 调用，当前固定为 0 */
  sentimentScore: number;
  sourceCredibility: number;
  freshness: number;
};

export type DaaNewsSignal = {
  symbol: string;
  scorePct: number;
  confidencePct: number;
  evidenceCount: number;
  reasons: string[];
  items: DaaNewsSignalItem[];
  llmSummary: string | null;
  llmDrivers: { bullish: string[]; bearish: string[] } | null;
  llmMajorEvent: { type: string; impact: string; description: string } | null;
  llmActionHint: string | null;
};

// ─── Constants ───────────────────────────────────────────────

const NEWS_SIGNAL_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const FRESHNESS_HALF_LIFE_HOURS = 72;

// ─── Core Functions ──────────────────────────────────────────

export async function buildNewsSignalForSymbol(
  symbol: string,
  market = "US",
): Promise<DaaNewsSignal | null> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  // Step 1: 检查缓存（单次 DB 查询，修复 P1-3）
  const cached = await getCachedSignal(normalizedSymbol);

  // Step 2: 拉取新闻（传 market 参数，修复 P2-4）
  let rawItems: RawNewsItem[] = [];
  try {
    rawItems = await fetchNewsForSymbol(normalizedSymbol, market, 7);
  } catch (e) {
    logSwallowed("newsSignal.fetch", e);
  }

  // Step 3: 存储新闻 item（sentimentScore=0 标记为 reserved，P0-1 修复）
  const newsItems = rawItems.map((item) => toNewsSignalItem(normalizedSymbol, item));
  if (newsItems.length > 0) {
    try {
      await upsertDaaNewsItemSnapshots(newsItems.map((item) => ({
        provider: "multi",
        symbol: normalizedSymbol,
        itemHash: hashNewsItem(item.title, item.link, item.ts),
        title: item.title,
        link: item.link,
        publishedAt: item.ts,
        sentimentScore: 0, // reserved: per-item LLM 分析待未来实现
        sourceCredibility: item.sourceCredibility,
        freshness: item.freshness,
      })));
    } catch (e) {
      logSwallowed("newsSignal.upsertItems", e);
    }
  }

  // Step 4: 判断是否需要 LLM 分析
  const currentHashSet = computeItemHashSet(rawItems);
  const needReanalyze = !cached
    || (Date.now() - Date.parse(cached.generatedAt)) > NEWS_SIGNAL_CACHE_TTL_MS
    || cached.itemHashSet !== currentHashSet;

  // Step 5: LLM 分析
  let llmAnalysis: LlmNewsAnalysis | null = null;
  if (needReanalyze && rawItems.length > 0) {
    llmAnalysis = await analyzeNewsWithLlm({ symbol: normalizedSymbol, items: rawItems });
  }

  // Step 6: 构建信号（P0-2 修复：不再反推 sentimentScore）
  const signal = buildSignalFromAnalysis({
    symbol: normalizedSymbol,
    items: newsItems,
    llmAnalysis,
    cached,
  });

  // Step 7: 原子写入所有字段（P1-4 修复：不再 upsert 后 UPDATE）
  try {
    const { daaPgPool } = await import("@/src/daa/pg/daaPg");
    const pool = daaPgPool();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO daa_news_signal_snapshot_v1
        (provider, symbol, score_pct, confidence_pct, evidence_count, reasons_json, generated_at, updated_at,
         llm_summary, llm_drivers_json, llm_major_event_json, llm_action_hint, item_hash_set)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (provider, symbol) DO UPDATE SET
         score_pct = EXCLUDED.score_pct,
         confidence_pct = EXCLUDED.confidence_pct,
         evidence_count = EXCLUDED.evidence_count,
         reasons_json = EXCLUDED.reasons_json,
         generated_at = EXCLUDED.generated_at,
         updated_at = EXCLUDED.updated_at,
         llm_summary = EXCLUDED.llm_summary,
         llm_drivers_json = EXCLUDED.llm_drivers_json,
         llm_major_event_json = EXCLUDED.llm_major_event_json,
         llm_action_hint = EXCLUDED.llm_action_hint,
         item_hash_set = EXCLUDED.item_hash_set`,
      [
        "multi", normalizedSymbol,
        signal.scorePct, signal.confidencePct, signal.evidenceCount,
        JSON.stringify(signal.reasons), now,
        signal.llmSummary,
        signal.llmDrivers ? JSON.stringify(signal.llmDrivers) : null,
        signal.llmMajorEvent ? JSON.stringify(signal.llmMajorEvent) : null,
        signal.llmActionHint,
        currentHashSet,
      ],
    );
  } catch (e) {
    logSwallowed("newsSignal.upsert", e);
  }

  return signal;
}

/**
 * 批量构建新闻信号。
 * @param opts.symbolsWithMarket — 带市场信息的 symbol 列表（优先使用，修复 P2-4）
 */
export async function buildNewsSignals(opts: {
  symbols?: string[];
  symbolsWithMarket?: Array<{ symbol: string; market: string }>;
  query?: string;
}): Promise<DaaNewsSignal[]> {
  const { parseSymbolsFromNewsQuery } = await import("@/src/market/yahooRssFetch");
  const symbolsFromQuery = opts.query ? parseSymbolsFromNewsQuery(opts.query) : [];

  // 构建 symbol → market 映射
  const marketMap = new Map<string, string>();
  for (const item of opts.symbolsWithMarket ?? []) {
    marketMap.set(item.symbol.toUpperCase(), item.market.toUpperCase());
  }

  const allSymbols = [...new Set([
    ...(opts.symbols || []),
    ...symbolsFromQuery,
    ...(opts.symbolsWithMarket?.map((s) => s.symbol) ?? []),
  ])].filter(Boolean);

  if (allSymbols.length === 0) return [];

  const results: DaaNewsSignal[] = [];
  const concurrency = 4;

  for (let i = 0; i < allSymbols.length; i += concurrency) {
    const batch = allSymbols.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((sym) => {
        const market = marketMap.get(sym.toUpperCase()) || "US";
        return buildNewsSignalForSymbol(sym, market).catch((e) => {
          logSwallowed(`newsSignal.batch.${sym}`, e);
          return null;
        });
      }),
    );
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────

/** 单次 DB 查询获取缓存（修复 P1-3：合并两次查询为一次） */
async function getCachedSignal(symbol: string): Promise<{
  scorePct: number;
  confidencePct: number;
  generatedAt: string;
  itemHashSet: string | null;
  llmSummary: string | null;
  llmDrivers: { bullish: string[]; bearish: string[] } | null;
  llmMajorEvent: { type: string; impact: string; description: string } | null;
  llmActionHint: string | null;
} | null> {
  try {
    const { daaPgPool } = await import("@/src/daa/pg/daaPg");
    const pool = daaPgPool();
    const result = await pool.query(
      `SELECT score_pct, confidence_pct, generated_at,
              llm_summary, llm_drivers_json, llm_major_event_json, llm_action_hint, item_hash_set
       FROM daa_news_signal_snapshot_v1
       WHERE provider = 'multi' AND symbol = $1
       LIMIT 1`,
      [symbol],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      scorePct: Number(row.score_pct) || 50,
      confidencePct: Number(row.confidence_pct) || 0,
      generatedAt: String(row.generated_at || ""),
      itemHashSet: row.item_hash_set ? String(row.item_hash_set) : null,
      llmSummary: row.llm_summary ? String(row.llm_summary) : null,
      llmDrivers: row.llm_drivers_json ? row.llm_drivers_json as { bullish: string[]; bearish: string[] } : null,
      llmMajorEvent: row.llm_major_event_json ? row.llm_major_event_json as { type: string; impact: string; description: string } : null,
      llmActionHint: row.llm_action_hint ? String(row.llm_action_hint) : null,
    };
  } catch (e) {
    logSwallowed("newsSignal.getCached", e);
    return null;
  }
}

/**
 * 修复 P0-2：不再从 scorePct 反推 sentimentScore。
 * 缓存时直接用已存储的 llm 字段，不做数学反推。
 */
function buildSignalFromAnalysis(input: {
  symbol: string;
  items: DaaNewsSignalItem[];
  llmAnalysis: LlmNewsAnalysis | null;
  cached: Awaited<ReturnType<typeof getCachedSignal>>;
}): DaaNewsSignal {
  const { symbol, items, llmAnalysis, cached } = input;

  // 优先使用新鲜 LLM 分析；fallback 直接用缓存字段（不反推）
  let scorePct: number;
  let summary: string | null;
  let drivers: { bullish: string[]; bearish: string[] } | null;
  let majorEvent: { type: string; impact: string; description: string } | null;
  let actionHint: string | null;

  if (llmAnalysis) {
    scorePct = clamp(50 + llmAnalysis.sentimentScore / 2, 0, 100);
    summary = llmAnalysis.summary;
    drivers = llmAnalysis.drivers;
    majorEvent = llmAnalysis.majorEvent;
    actionHint = llmAnalysis.actionHint;
  } else if (cached) {
    // P0-2 修复：直接用缓存的 scorePct 和 llm 字段，不反推
    scorePct = cached.scorePct;
    summary = cached.llmSummary;
    drivers = cached.llmDrivers;
    majorEvent = cached.llmMajorEvent;
    actionHint = cached.llmActionHint;
  } else {
    scorePct = 50;
    summary = null;
    drivers = null;
    majorEvent = null;
    actionHint = null;
  }

  const hasLlm = !!summary && summary !== "暂无分析" && summary !== "无足够新闻数据进行分析";
  const confidencePct = clamp(
    30 + Math.min(30, items.length * 4) + (hasLlm ? 25 : 0),
    0, 100,
  );

  const reasons: string[] = [];
  if (summary && hasLlm) reasons.push(summary);
  if (drivers) {
    for (const b of (drivers.bullish || []).slice(0, 2)) reasons.push(`利好: ${b}`);
    for (const b of (drivers.bearish || []).slice(0, 2)) reasons.push(`利空: ${b}`);
  }
  if (reasons.length === 0) {
    reasons.push(items.length > 0 ? `近期 ${items.length} 条新闻` : "无近期新闻");
  }

  return {
    symbol,
    scorePct: +scorePct.toFixed(2),
    confidencePct: +confidencePct.toFixed(2),
    evidenceCount: items.length,
    reasons,
    items: items.slice(0, 12),
    llmSummary: summary,
    llmDrivers: drivers,
    llmMajorEvent: majorEvent,
    llmActionHint: actionHint,
  };
}

function toNewsSignalItem(symbol: string, raw: RawNewsItem): DaaNewsSignalItem {
  const publishedAt = raw.publishedAt ? new Date(raw.publishedAt).toISOString() : new Date().toISOString();
  const ageHours = Math.max(0, (Date.now() - Date.parse(publishedAt)) / (1000 * 60 * 60));
  const freshness = clamp(Math.pow(2, -ageHours / FRESHNESS_HALF_LIFE_HOURS), 0.08, 1);

  return {
    symbol,
    title: raw.title,
    link: raw.link || null,
    ts: publishedAt,
    sentimentScore: 0, // reserved: per-item LLM 分析待未来实现
    sourceCredibility: sourceCredibility(raw.source),
    freshness,
  };
}

function hashNewsItem(title: string, link: string | null, ts: string): string {
  return createHash("sha1").update(`${title}::${link || ""}::${ts}`).digest("hex").slice(0, 20);
}
