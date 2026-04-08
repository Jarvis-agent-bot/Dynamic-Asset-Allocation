/**
 * newsSignal.ts — 新闻信号核心模块（v2 重构）
 *
 * 多数据源（Finnhub + Yahoo RSS）+ LLM 语义分析。
 * 替代原来的关键词匹配方式。
 *
 * 缓存策略：
 * - 新闻 item: 每次刷新都拉取（去重写入 DB）
 * - LLM 分析: 2 小时 TTL，或新闻 item 有变化时重新分析
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
  // LLM 分析结果（v2 新增）
  llmSummary: string | null;
  llmDrivers: { bullish: string[]; bearish: string[] } | null;
  llmMajorEvent: { type: string; impact: string; description: string } | null;
  llmActionHint: string | null;
};

// ─── Constants ───────────────────────────────────────────────

const NEWS_SIGNAL_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 小时 LLM 分析缓存
const FRESHNESS_HALF_LIFE_HOURS = 72;

// ─── Core Functions ──────────────────────────────────────────

/**
 * 为单个 symbol 构建新闻信号（多源 + LLM）。
 */
export async function buildNewsSignalForSymbol(
  symbol: string,
  market = "US",
): Promise<DaaNewsSignal | null> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  // Step 1: 检查 LLM 分析缓存
  const cached = await getCachedSignal(normalizedSymbol);

  // Step 2: 从多数据源拉取最新新闻
  let rawItems: RawNewsItem[] = [];
  try {
    rawItems = await fetchNewsForSymbol(normalizedSymbol, market, 7);
  } catch (e) {
    logSwallowed("newsSignal.fetch", e);
  }

  // Step 3: 转换 + 存储新闻 item
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
        sentimentScore: item.sentimentScore,
        sourceCredibility: item.sourceCredibility,
        freshness: item.freshness,
      })));
    } catch (e) {
      logSwallowed("newsSignal.upsertItems", e);
    }
  }

  // Step 4: 判断是否需要重新 LLM 分析
  const currentHashSet = computeItemHashSet(rawItems);
  const needReanalyze = !cached
    || (Date.now() - Date.parse(cached.generatedAt)) > NEWS_SIGNAL_CACHE_TTL_MS
    || cached.itemHashSet !== currentHashSet;

  // Step 5: LLM 分析（或用缓存）
  let llmAnalysis: LlmNewsAnalysis | null = null;
  if (needReanalyze && rawItems.length > 0) {
    llmAnalysis = await analyzeNewsWithLlm({ symbol: normalizedSymbol, items: rawItems });
  }

  // Step 6: 构建信号
  const signal = buildSignalFromAnalysis({
    symbol: normalizedSymbol,
    items: newsItems,
    llmAnalysis,
    cached,
  });

  // Step 7: 存储信号快照
  try {
    await upsertDaaNewsSignalSnapshots([{
      provider: "multi",
      symbol: normalizedSymbol,
      scorePct: signal.scorePct,
      confidencePct: signal.confidencePct,
      evidenceCount: signal.evidenceCount,
      reasonsJson: signal.reasons,
      generatedAt: new Date().toISOString(),
    }]);

    // 写入 LLM 扩展字段
    if (llmAnalysis || signal.llmSummary) {
      const { daaPgPool } = await import("@/src/daa/pg/daaPg");
      const pool = daaPgPool();
      await pool.query(
        `UPDATE daa_news_signal_snapshot_v1
         SET llm_summary = $1, llm_drivers_json = $2, llm_major_event_json = $3, llm_action_hint = $4, item_hash_set = $5
         WHERE provider = 'multi' AND symbol = $6`,
        [
          signal.llmSummary,
          signal.llmDrivers ? JSON.stringify(signal.llmDrivers) : null,
          signal.llmMajorEvent ? JSON.stringify(signal.llmMajorEvent) : null,
          signal.llmActionHint,
          currentHashSet,
          normalizedSymbol,
        ],
      ).catch((e) => logSwallowed("newsSignal.upsertLlm", e));
    }
  } catch (e) {
    logSwallowed("newsSignal.upsertSignal", e);
  }

  return signal;
}

/**
 * 批量构建新闻信号。
 */
export async function buildNewsSignals(opts: {
  symbols?: string[];
  query?: string;
}): Promise<DaaNewsSignal[]> {
  const { parseSymbolsFromNewsQuery } = await import("@/src/market/yahooRssFetch");
  const symbolsFromQuery = opts.query ? parseSymbolsFromNewsQuery(opts.query) : [];
  const allSymbols = [...new Set([...(opts.symbols || []), ...symbolsFromQuery])].filter(Boolean);

  if (allSymbols.length === 0) return [];

  const results: DaaNewsSignal[] = [];
  const concurrency = 4;

  for (let i = 0; i < allSymbols.length; i += concurrency) {
    const batch = allSymbols.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((sym) => buildNewsSignalForSymbol(sym).catch((e) => {
        logSwallowed(`newsSignal.batch.${sym}`, e);
        return null;
      })),
    );
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────

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
    const snapshot = await getDaaNewsSignalSnapshotBySymbol({ provider: "multi", symbol });
    if (!snapshot) return null;

    const { daaPgPool } = await import("@/src/daa/pg/daaPg");
    const pool = daaPgPool();
    const ext = await pool.query(
      `SELECT llm_summary, llm_drivers_json, llm_major_event_json, llm_action_hint, item_hash_set
       FROM daa_news_signal_snapshot_v1
       WHERE provider = 'multi' AND symbol = $1`,
      [symbol],
    );
    const row = ext.rows[0] as Record<string, unknown> | undefined;

    return {
      scorePct: snapshot.scorePct,
      confidencePct: snapshot.confidencePct,
      generatedAt: snapshot.generatedAt,
      itemHashSet: row?.item_hash_set ? String(row.item_hash_set) : null,
      llmSummary: row?.llm_summary ? String(row.llm_summary) : null,
      llmDrivers: row?.llm_drivers_json ? row.llm_drivers_json as { bullish: string[]; bearish: string[] } : null,
      llmMajorEvent: row?.llm_major_event_json ? row.llm_major_event_json as { type: string; impact: string; description: string } : null,
      llmActionHint: row?.llm_action_hint ? String(row.llm_action_hint) : null,
    };
  } catch (e) {
    logSwallowed("newsSignal.getCached", e);
    return null;
  }
}

function buildSignalFromAnalysis(input: {
  symbol: string;
  items: DaaNewsSignalItem[];
  llmAnalysis: LlmNewsAnalysis | null;
  cached: Awaited<ReturnType<typeof getCachedSignal>>;
}): DaaNewsSignal {
  const { symbol, items, llmAnalysis, cached } = input;

  const analysis = llmAnalysis ?? (cached ? {
    sentimentScore: (cached.scorePct - 50) * 2,
    summary: cached.llmSummary || "暂无分析",
    drivers: cached.llmDrivers || { bullish: [], bearish: [] },
    majorEvent: cached.llmMajorEvent || null,
    actionHint: cached.llmActionHint || "无影响",
  } : null);

  const scorePct = analysis
    ? clamp(50 + analysis.sentimentScore / 2, 0, 100)
    : 50;

  const hasLlm = !!analysis && analysis.summary !== "暂无分析";
  const confidencePct = clamp(
    30
    + Math.min(30, items.length * 4)
    + (hasLlm ? 25 : 0),
    0, 100,
  );

  const reasons: string[] = [];
  if (analysis) {
    if (analysis.summary && analysis.summary !== "暂无分析") reasons.push(analysis.summary);
    for (const b of (analysis.drivers.bullish || []).slice(0, 2)) reasons.push(`利好: ${b}`);
    for (const b of (analysis.drivers.bearish || []).slice(0, 2)) reasons.push(`利空: ${b}`);
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
    llmSummary: analysis?.summary ?? null,
    llmDrivers: analysis?.drivers ?? null,
    llmMajorEvent: analysis?.majorEvent ?? null,
    llmActionHint: analysis?.actionHint ?? null,
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
    sentimentScore: 0,
    sourceCredibility: sourceCredibility(raw.source),
    freshness,
  };
}

function hashNewsItem(title: string, link: string | null, ts: string): string {
  return createHash("sha1").update(`${title}::${link || ""}::${ts}`).digest("hex").slice(0, 20);
}
