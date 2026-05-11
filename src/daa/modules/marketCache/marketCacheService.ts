import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  appendDaaExternalPayloadRaw,
  appendDaaMarketPriceHistoryRows,
  deleteExpiredDaaExternalPayloadRaw,
  getDaaMarketCacheHealthStats,
  listDaaMarketPriceSnapshots,
  listLatestDaaMarketPriceHistoryRows,
  upsertDaaMarketPriceSnapshots,
} from "@/src/daa/store/daaStorePg";
import { addDaysIsoUtc } from "@/src/market/yfinance";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { normalizeText, normalizeUpper, toFinite } from "@/src/daa/utils/normalize";
import { MARKET_DATA_USER_AGENT } from "@/src/market/constants";

type MarketCachePriceStatus = "fresh" | "stale" | "missing";

export type MarketPriceAssetInput = {
  symbol: string;
  market: string;
  currency?: string;
};

export type MarketPriceResolved = {
  provider: string;
  symbol: string;
  market: string;
  currency: string;
  price: number;
  priceStatus: MarketCachePriceStatus;
  priceUpdatedAt: string | null;
  priceAgeSec: number | null;
  priceSource: string;
};

const DEFAULT_PROVIDER_ = "yfinance";
const DEFAULT_TIMEOUT_MS_ = 2600;
const DEFAULT_CONCURRENCY_ = 6;
const DEFAULT_REFRESH_BUDGET_ = 10;
const DEFAULT_FRESH_SEC_ = 15 * 60;
const DEFAULT_SERVE_STALE_SEC_ = 48 * 60 * 60;

type FetchResult = {
  ok: boolean;
  status: number;
  price: number;
  payloadJson: Record<string, unknown> | null;
  payloadText: string;
  responseHeaders: Record<string, string>;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
};

type SnapshotLike = {
  status?: string | null;
  priceUpdatedAt?: string | null;
};

type YfinanceChartPayload = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      meta?: { regularMarketPrice?: number };
    }>;
    error?: { code?: string; description?: string } | null;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAgeSec(iso: string | null): number | null {
  const text = normalizeText(iso);
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

function buildKey(row: { market: string; symbol: string }): string {
  return `${normalizeUpper(row.market, "US")}::${normalizeUpper(row.symbol)}`;
}

function classifyByAge(ageSec: number | null, opts: { freshSec: number; serveStaleSec: number }): MarketCachePriceStatus {
  if (ageSec == null) return "stale";
  if (ageSec <= opts.freshSec) return "fresh";
  if (ageSec <= opts.serveStaleSec) return "stale";
  return "missing";
}

function resolveSnapshotStatus(snapshot: SnapshotLike | null | undefined, opts: { freshSec: number; serveStaleSec: number }): MarketCachePriceStatus {
  const rawStatus = normalizeText(snapshot?.status).toLowerCase();
  const ageSec = toAgeSec(snapshot?.priceUpdatedAt || null);
  if (rawStatus === "missing" || rawStatus === "error" || rawStatus === "unsupported") return "missing";
  if (rawStatus === "stale") {
    if (ageSec != null && ageSec > opts.serveStaleSec) return "missing";
    return "stale";
  }
  return classifyByAge(ageSec, opts);
}

function resolveHistoryFallback(input: {
  latestHistory: {
    price: number;
    ts: string;
    currency: string;
    source: string;
  } | null;
  defaultCurrency: string;
  source: string;
  serveStaleSec: number;
  emptyStatus: "missing" | "unsupported";
}): {
  price: number;
  currency: string;
  status: "stale" | "missing" | "unsupported";
  priceUpdatedAt: string | null;
  source: string;
} {
  const history = input.latestHistory;
  if (history && history.price > 0) {
    const ageSec = toAgeSec(history.ts);
    if (ageSec != null && ageSec <= input.serveStaleSec) {
      return {
        price: history.price,
        currency: normalizeUpper(history.currency, input.defaultCurrency),
        status: "stale",
        priceUpdatedAt: history.ts,
        source: `${input.source}:history:${normalizeText(history.source, "market_cache")}`,
      };
    }
  }
  return {
    price: 0,
    currency: input.defaultCurrency,
    status: input.emptyStatus,
    priceUpdatedAt: null,
    source: input.source,
  };
}

function extractHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function pickLatestClose(payload: YfinanceChartPayload | null): number {
  const closes = Array.isArray(payload?.chart?.result?.[0]?.indicators?.quote?.[0]?.close)
    ? payload.chart.result[0].indicators.quote[0].close
    : [];

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const close = Number(closes[i]);
    if (!Number.isFinite(close) || close <= 0) continue;
    return close;
  }
  return 0;
}

async function fetchYfinanceLatestCloseWithRaw(symbol: string, timeoutMs: number): Promise<FetchResult> {
  const end = new Date().toISOString().slice(0, 10);
  const start = addDaysIsoUtc(end, -10);
  const endExclusive = addDaysIsoUtc(end, 1);

  const period1 = Math.floor(Date.parse(`${start}T00:00:00.000Z`) / 1000);
  const period2 = Math.floor(Date.parse(`${endExclusive}T00:00:00.000Z`) / 1000);

  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set("interval", "1d");
  upstream.searchParams.set("events", "div%7Csplit");
  upstream.searchParams.set("period1", String(period1));
  upstream.searchParams.set("period2", String(period2));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": MARKET_DATA_USER_AGENT,
      },
    });
    const payloadText = await response.text();
    let payloadJson: Record<string, unknown> | null = null;
    try {
      payloadJson = JSON.parse(payloadText) as Record<string, unknown>;
    } catch (err) {
      logSwallowed("marketCacheService.parsePayload", err);
      payloadJson = null;
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      return {
        ok: false,
        status: response.status,
        price: 0,
        payloadJson,
        payloadText,
        responseHeaders: extractHeaders(response.headers),
        errorCode: `http_${response.status}`,
        errorMessage: "yfinance upstream error",
        retryable,
      };
    }

    const typedPayload = payloadJson as YfinanceChartPayload | null;
    const chartError = typedPayload?.chart?.error;
    if (chartError) {
      return {
        ok: false,
        status: 200,
        price: 0,
        payloadJson,
        payloadText,
        responseHeaders: extractHeaders(response.headers),
        errorCode: normalizeText(chartError?.code, "chart_error"),
        errorMessage: normalizeText(chartError?.description, "yfinance chart error"),
        retryable: false,
      };
    }

    const latest = pickLatestClose(typedPayload);
    if (!(latest > 0)) {
      return {
        ok: false,
        status: 200,
        price: 0,
        payloadJson,
        payloadText,
        responseHeaders: extractHeaders(response.headers),
        errorCode: "price_missing",
        errorMessage: "latest close missing",
        retryable: false,
      };
    }

    return {
      ok: true,
      status: response.status,
      price: latest,
      payloadJson,
      payloadText,
      responseHeaders: extractHeaders(response.headers),
      errorCode: null,
      errorMessage: null,
      retryable: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      price: 0,
      payloadJson: null,
      payloadText: "",
      responseHeaders: {},
      errorCode: isAbort ? "timeout" : "fetch_failed",
      errorMessage: message,
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(symbol: string, timeoutMs: number): Promise<FetchResult> {
  const first = await fetchYfinanceLatestCloseWithRaw(symbol, timeoutMs);
  if (first.ok || !first.retryable) return first;
  await sleep(350);
  return fetchYfinanceLatestCloseWithRaw(symbol, timeoutMs);
}

export async function getMarketPricesWithCache(input: {
  assets: MarketPriceAssetInput[];
  provider?: string;
  allowRefresh?: boolean;
  forceRefresh?: boolean;
  refreshBudget?: number;
  timeoutMs?: number;
  source?: string;
  freshSec?: number;
  serveStaleSec?: number;
  rawRetentionDays?: number;
  concurrency?: number;
}): Promise<Record<string, MarketPriceResolved>> {
  const assets = Array.isArray(input.assets) ? input.assets : [];
  const provider = normalizeText(input.provider, DEFAULT_PROVIDER_);
  const allowRefresh = input.allowRefresh !== false;
  const forceRefresh = input.forceRefresh === true;
  const refreshBudget = Math.max(0, Math.min(200, Math.trunc(toFinite(input.refreshBudget, DEFAULT_REFRESH_BUDGET_))));
  const timeoutMs = Math.max(600, Math.min(8000, Math.trunc(toFinite(input.timeoutMs, DEFAULT_TIMEOUT_MS_))));
  const source = normalizeText(input.source, "market_cache");
  const freshSec = Math.max(60, Math.min(2 * 3600, Math.trunc(toFinite(input.freshSec, DEFAULT_FRESH_SEC_))));
  const serveStaleSec = Math.max(freshSec, Math.min(7 * 24 * 3600, Math.trunc(toFinite(input.serveStaleSec, DEFAULT_SERVE_STALE_SEC_))));
  const rawRetentionDays = Math.max(7, Math.min(365, Math.trunc(toFinite(input.rawRetentionDays, 90))));
  const concurrency = Math.max(1, Math.min(12, Math.trunc(toFinite(input.concurrency, DEFAULT_CONCURRENCY_))));

  const deduped = new Map<string, MarketPriceAssetInput>();
  for (const asset of assets) {
    const symbol = normalizeUpper(asset.symbol);
    const market = normalizeUpper(asset.market, "US");
    if (!symbol) continue;
    const key = buildKey({ market, symbol });
    if (!deduped.has(key)) {
      deduped.set(key, {
        symbol,
        market,
        currency: normalizeUpper(asset.currency, "USD"),
      });
    }
  }

  const rows = [...deduped.values()];
  if (rows.length <= 0) return {};

  const markets = [...new Set(rows.map((row) => row.market))];
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  const [snapshots, latestHistoryRows] = await Promise.all([
    listDaaMarketPriceSnapshots({
      provider,
      markets,
      symbols,
      limit: Math.max(200, rows.length * 3),
    }),
    listLatestDaaMarketPriceHistoryRows({
      provider,
      markets,
      symbols,
      limit: Math.max(200, rows.length * 2),
    }),
  ]);

  const snapshotByKey = new Map<string, (typeof snapshots)[number]>();
  for (const row of snapshots) {
    const key = buildKey({ market: row.market, symbol: row.symbol });
    if (snapshotByKey.has(key)) continue;
    snapshotByKey.set(key, row);
  }

  const latestHistoryByKey = new Map<string, (typeof latestHistoryRows)[number]>();
  for (const row of latestHistoryRows) {
    const key = buildKey({ market: row.market, symbol: row.symbol });
    if (latestHistoryByKey.has(key)) continue;
    latestHistoryByKey.set(key, row);
  }

  const refreshTargets: MarketPriceAssetInput[] = [];
  if (allowRefresh) {
    for (const row of rows) {
      const key = buildKey(row);
      const snapshot = snapshotByKey.get(key);
      const ageSec = snapshot ? toAgeSec(snapshot.priceUpdatedAt) : null;
      const expired = ageSec != null && ageSec > freshSec;
      const missingPrice = !(snapshot && snapshot.price > 0);
      const shouldRefresh = forceRefresh || missingPrice || expired;
      if (!shouldRefresh) continue;
      refreshTargets.push(row);
      if (!forceRefresh && refreshTargets.length >= refreshBudget) break;
    }
  }

  if (refreshTargets.length > 0) {
    let cursor = 0;
    async function worker() {
      for (;;) {
        const current = refreshTargets[cursor];
        cursor += 1;
        if (!current) break;

        const key = buildKey(current);
        const existing = snapshotByKey.get(key) || null;
        const latestHistory = latestHistoryByKey.get(key) || null;
        const fallbackFromHistory = resolveHistoryFallback({
          latestHistory,
          defaultCurrency: normalizeUpper(current.currency || existing?.currency || latestHistory?.currency, "USD"),
          source,
          serveStaleSec,
          emptyStatus: "missing",
        });
        const yfinanceSymbol = toYfinanceSymbolByMarket(current.symbol, current.market);
        if (!yfinanceSymbol) {
          const fallbackPrice = existing && existing.price > 0 ? existing.price : fallbackFromHistory.price;
          const fallbackStatus = existing && existing.price > 0 ? "stale" : (fallbackFromHistory.price > 0 ? "stale" : "unsupported");
          const fallbackUpdatedAt = existing && existing.price > 0 ? (existing.priceUpdatedAt || null) : fallbackFromHistory.priceUpdatedAt;
          const fallbackSource = existing && existing.price > 0
            ? (existing.source || source)
            : (fallbackFromHistory.price > 0 ? fallbackFromHistory.source : source);
          const saved = await upsertDaaMarketPriceSnapshots([
            {
              provider,
              market: current.market,
              symbol: current.symbol,
              normalizedSymbol: current.symbol,
              currency: fallbackFromHistory.currency || current.currency || existing?.currency || "USD",
              price: fallbackPrice,
              status: fallbackStatus,
              priceUpdatedAt: fallbackUpdatedAt,
              source: fallbackSource,
              errorCode: "unsupported_symbol",
              errorMessage: "symbol not supported by yfinance mapper",
              rawRefId: latestHistory?.rawRefId || null,
            },
          ]);
          if (saved[0]) snapshotByKey.set(key, saved[0]);
          continue;
        }

        const fetchedAt = new Date().toISOString();
        const fetchResult = await fetchWithRetry(yfinanceSymbol, timeoutMs);

        let rawRefId: string | null = null;
        if (fetchResult.payloadJson || fetchResult.payloadText) {
          try {
            const raw = await appendDaaExternalPayloadRaw({
              provider,
              resource: "yfinance.chart.latest",
              subjectKey: `${current.market}::${current.symbol}`,
              requestUrl: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfinanceSymbol)}`,
              requestJson: {
                market: current.market,
                symbol: current.symbol,
                normalizedSymbol: yfinanceSymbol,
              },
              responseStatus: fetchResult.status,
              responseHeadersJson: fetchResult.responseHeaders,
              payloadJson: fetchResult.payloadJson,
              payloadText: fetchResult.payloadText || null,
              fetchedAt,
              expireAt: new Date(Date.now() + rawRetentionDays * 24 * 3600 * 1000).toISOString(),
            });
            rawRefId = raw.id;
          } catch (err) {
            logSwallowed("marketCacheService.appendRawRef", err);
            rawRefId = null;
          }
        }

        if (fetchResult.ok && fetchResult.price > 0) {
          const saved = await upsertDaaMarketPriceSnapshots([
            {
              provider,
              market: current.market,
              symbol: current.symbol,
              normalizedSymbol: yfinanceSymbol,
              currency: current.currency || existing?.currency || "USD",
              price: fetchResult.price,
              status: "fresh",
              priceUpdatedAt: fetchedAt,
              source: `${source}:yfinance:${yfinanceSymbol}`,
              errorCode: null,
              errorMessage: null,
              rawRefId,
            },
          ]);
          if (saved[0]) snapshotByKey.set(key, saved[0]);
          await appendDaaMarketPriceHistoryRows([
            {
              provider,
              market: current.market,
              symbol: current.symbol,
              ts: fetchedAt,
              price: fetchResult.price,
              currency: current.currency || existing?.currency || "USD",
              source: `${source}:yfinance:${yfinanceSymbol}`,
              rawRefId,
            },
          ]);
          continue;
        }

        const fallbackPrice = existing && existing.price > 0 ? existing.price : fallbackFromHistory.price;
        const fallbackStatus = existing && existing.price > 0 ? "stale" : fallbackFromHistory.status;
        const fallbackUpdatedAt = existing && existing.price > 0 ? (existing.priceUpdatedAt || null) : fallbackFromHistory.priceUpdatedAt;
        const fallbackSource = existing && existing.price > 0
          ? (existing.source || `${source}:yfinance:${yfinanceSymbol}`)
          : (fallbackFromHistory.price > 0 ? fallbackFromHistory.source : `${source}:yfinance:${yfinanceSymbol}`);
        const saved = await upsertDaaMarketPriceSnapshots([
          {
            provider,
            market: current.market,
            symbol: current.symbol,
            normalizedSymbol: yfinanceSymbol,
            currency: fallbackFromHistory.currency || current.currency || existing?.currency || "USD",
            price: fallbackPrice,
            status: fallbackStatus,
            priceUpdatedAt: fallbackUpdatedAt,
            source: fallbackSource,
            errorCode: fetchResult.errorCode,
            errorMessage: fetchResult.errorMessage,
            rawRefId,
          },
        ]);
        if (saved[0]) snapshotByKey.set(key, saved[0]);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, refreshTargets.length) }, () => worker()));
  }

  const out: Record<string, MarketPriceResolved> = {};
  for (const row of rows) {
    const key = buildKey(row);
    const snapshot = snapshotByKey.get(key);
    const defaultCurrency = normalizeUpper(row.currency, "USD");

    const latestHistory = latestHistoryByKey.get(key) || null;
    const historyFallback = resolveHistoryFallback({
      latestHistory,
      defaultCurrency,
      source: snapshot?.source || `${provider}:${row.symbol}`,
      serveStaleSec,
      emptyStatus: "missing",
    });

    if (!snapshot || !(snapshot.price > 0)) {
      out[key] = {
        provider,
        symbol: row.symbol,
        market: row.market,
        currency: historyFallback.price > 0 ? historyFallback.currency : (snapshot?.currency || defaultCurrency),
        price: historyFallback.price > 0 ? historyFallback.price : 0,
        priceStatus: historyFallback.price > 0 ? "stale" : "missing",
        priceUpdatedAt: historyFallback.price > 0 ? historyFallback.priceUpdatedAt : (snapshot?.priceUpdatedAt || null),
        priceAgeSec: historyFallback.price > 0 ? toAgeSec(historyFallback.priceUpdatedAt) : (snapshot ? toAgeSec(snapshot.priceUpdatedAt) : null),
        priceSource: historyFallback.price > 0 ? historyFallback.source : (snapshot?.source || `${provider}:${row.symbol}`),
      };
      continue;
    }

    const ageSec = toAgeSec(snapshot.priceUpdatedAt);
    const status = resolveSnapshotStatus(snapshot, { freshSec, serveStaleSec });
    if (status === "missing" && historyFallback.price > 0) {
      out[key] = {
        provider,
        symbol: row.symbol,
        market: row.market,
        currency: historyFallback.currency,
        price: historyFallback.price,
        priceStatus: "stale",
        priceUpdatedAt: historyFallback.priceUpdatedAt,
        priceAgeSec: toAgeSec(historyFallback.priceUpdatedAt),
        priceSource: historyFallback.source,
      };
      continue;
    }

    out[key] = {
      provider,
      symbol: row.symbol,
      market: row.market,
      currency: snapshot.currency || defaultCurrency,
      price: status === "missing" ? 0 : snapshot.price,
      priceStatus: status,
      priceUpdatedAt: snapshot.priceUpdatedAt || null,
      priceAgeSec: ageSec,
      priceSource: snapshot.source || `${provider}:${row.symbol}`,
    };
  }

  return out;
}

export async function refreshMarketPrices(input: {
  assets: MarketPriceAssetInput[];
  triggerSource: string;
  provider?: string;
  timeoutMs?: number;
  concurrency?: number;
  rawRetentionDays?: number;
}): Promise<{
  refreshed: number;
  stale: number;
  missing: number;
  results: Record<string, MarketPriceResolved>;
}> {
  const results = await getMarketPricesWithCache({
    assets: input.assets,
    provider: input.provider,
    allowRefresh: true,
    forceRefresh: true,
    refreshBudget: Math.max(1, input.assets.length),
    timeoutMs: input.timeoutMs,
    source: "market_cache_refresh",
    concurrency: input.concurrency,
    rawRetentionDays: input.rawRetentionDays,
  });

  const rows = Object.values(results);
  const refreshed = rows.filter((row) => row.price > 0).length;
  const stale = rows.filter((row) => row.priceStatus === "stale").length;
  const missing = rows.filter((row) => row.priceStatus === "missing").length;

  return {
    refreshed,
    stale,
    missing,
    results,
  };
}

export async function getMarketCacheHealth(provider = DEFAULT_PROVIDER_) {
  return getDaaMarketCacheHealthStats(provider);
}

export async function cleanupMarketCacheRawPayload(nowIso?: string): Promise<{ removed: number; at: string }> {
  const at = nowIso ? new Date(nowIso).toISOString() : new Date().toISOString();
  const removed = await deleteExpiredDaaExternalPayloadRaw(at);
  return { removed, at };
}

/**
 * 统一数据清理：清理所有有 TTL 的表。
 * 由 cache-cleanup cron 每日调用。
 *
 * 保留策略：
 * - 原始 API 响应: 90 天
 * - 价格快照(非 fresh): 30 天
 * - 市场指标快照: 90 天
 * - 新闻 item: 30 天
 * - 新闻事件与事件图: 30 天
 * - 组合新闻影响: 90 天
 * - 已忽略/归档的候选发现: 180 天
 * - 通知记录: 180 天
 * - Job 日志: 90 天
 */
export async function runUnifiedDataCleanup(): Promise<Record<string, number>> {
  const { daaPgPool } = await import("@/src/daa/pg/daaPg");
  const pool = daaPgPool();
  const results: Record<string, number> = {};

  // 1. 原始 API 响应：90 天（已有逻辑）
  const rawResult = await cleanupMarketCacheRawPayload();
  results.raw_payloads = rawResult.removed;

  // 2. 旧价格快照（非 fresh）：30 天
  try {
    const r = await pool.query(
      "DELETE FROM daa_market_price_snapshot WHERE fetched_at < NOW() - INTERVAL '30 days' AND status != 'fresh'",
    );
    results.price_snapshots = r.rowCount ?? 0;
  } catch { results.price_snapshots = 0; }

  // 3. 旧市场指标快照：90 天
  try {
    const r = await pool.query(
      "DELETE FROM daa_market_indicator_snapshot_v1 WHERE created_at < NOW() - INTERVAL '90 days'",
    );
    results.indicator_snapshots = r.rowCount ?? 0;
  } catch { results.indicator_snapshots = 0; }

  // 4. 旧新闻 item：30 天
  try {
    const r = await pool.query(
      "DELETE FROM daa_news_item_snapshot_v1 WHERE updated_at < NOW() - INTERVAL '30 days'",
    );
    results.news_items = r.rowCount ?? 0;
  } catch { results.news_items = 0; }

  // 5. 旧新闻事件层与派生图谱：30 天
  try {
    const r = await pool.query(
      "DELETE FROM daa_news_event_snapshot_v1 WHERE updated_at < NOW() - INTERVAL '30 days'",
    );
    results.news_events = r.rowCount ?? 0;
  } catch { results.news_events = 0; }

  try {
    const r = await pool.query(
      "DELETE FROM daa_news_event_related_asset_v1 WHERE generated_at < NOW() - INTERVAL '30 days'",
    );
    results.news_event_related_assets = r.rowCount ?? 0;
  } catch { results.news_event_related_assets = 0; }

  try {
    const r = await pool.query(
      "DELETE FROM daa_news_event_graph_v1 WHERE generated_at < NOW() - INTERVAL '30 days'",
    );
    results.news_event_graphs = r.rowCount ?? 0;
  } catch { results.news_event_graphs = 0; }

  // 6. 旧组合新闻影响：90 天
  try {
    const r = await pool.query(
      "DELETE FROM daa_news_portfolio_impact_v1 WHERE generated_at < NOW() - INTERVAL '90 days'",
    );
    results.news_portfolio_impacts = r.rowCount ?? 0;
  } catch { results.news_portfolio_impacts = 0; }

  // 7. 已处理的候选发现：180 天；new/watching 保留，避免清掉仍需人工复核的研究线索。
  try {
    const r = await pool.query(
      "DELETE FROM daa_discovery_candidates_v1 WHERE status IN ('dismissed', 'archived') AND updated_at < NOW() - INTERVAL '180 days'",
    );
    results.discovery_candidates = r.rowCount ?? 0;
  } catch { results.discovery_candidates = 0; }

  // 8. 旧通知记录：180 天
  try {
    const r = await pool.query(
      "DELETE FROM daa_notification_delivery_log WHERE created_at < NOW() - INTERVAL '180 days'",
    );
    results.notification_logs = r.rowCount ?? 0;
  } catch { results.notification_logs = 0; }

  // 9. 旧 job 日志：90 天
  try {
    const r1 = await pool.query(
      "DELETE FROM daa_job_execution_logs WHERE started_at < NOW() - INTERVAL '90 days'",
    );
    const r2 = await pool.query(
      "DELETE FROM daa_ingest_job_log_v1 WHERE started_at < NOW() - INTERVAL '90 days'",
    );
    results.job_logs = (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
  } catch { results.job_logs = 0; }

  return results;
}
