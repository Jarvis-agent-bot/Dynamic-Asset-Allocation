/**
 * Market-cache store functions.
 */

import { createHash, randomUUID } from "node:crypto";
import { normalizeText, toFinite, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { DaaMarketIndicatorKey, DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";
import {
  withDaaPgClient, parseJsonb, toIsoString, withPgTransaction, clampNumber, normalizeUpper, normalizeStringArray,
} from "./storeShared";
import type {
  DaaStoreMarketPriceSnapshot, DaaStoreMarketPriceStatus, DaaStoreMarketPriceHistory,
  DaaStoreFxRateHistory, DaaStoreFxRateHistoryStatus,
  DaaStoreNewsItemSnapshot, DaaStoreNewsSignalSnapshot,
  DaaStoreMarketIndicatorSnapshot, DaaStoreHfHoldingSnapshot, DaaStoreHfSignalSnapshot,
  DaaStoreExternalPayloadRaw,
} from "./storeTypes";
import { ensureDaaMarketCacheSchemaPg } from "./storeSchema";
import { normalizeMarketIndicatorKey, normalizeMarketRegimeStore } from "./rebalanceCycleStore";

const RAW_PAYLOAD_SELECT_COLUMNS_ = [
  "id",
  "provider",
  "resource",
  "subject_key",
  "request_url",
  "request_json",
  "response_status",
  "response_headers_json",
  "payload_json",
  "payload_text",
  "fetched_at",
  "expire_at",
  "created_at",
].join(", ");

const MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_ = [
  "id",
  "indicator_key",
  "scope",
  "subject_key",
  "stance",
  "risk_off_score_pct",
  "confidence_pct",
  "raw_value",
  "unit",
  "percentile_252",
  "zscore_60",
  "trend_1d_pct",
  "trend_7d_pct",
  "trend_30d_pct",
  "source",
  "reasons_json",
  "components_json",
  "generated_at",
  "expire_at",
  "created_at",
].join(", ");

const NEWS_SIGNAL_SNAPSHOT_SELECT_COLUMNS_ = [
  "provider",
  "symbol",
  "score_pct",
  "confidence_pct",
  "evidence_count",
  "reasons_json",
  "generated_at",
  "updated_at",
].join(", ");

const NEWS_ITEM_SNAPSHOT_SELECT_COLUMNS_ = [
  "provider",
  "symbol",
  "item_hash",
  "title",
  "link",
  "published_at",
  "fetched_at",
  "sentiment_score",
  "source_credibility",
  "freshness",
  "raw_ref_id",
].join(", ");

const MARKET_PRICE_SNAPSHOT_SELECT_COLUMNS_ = [
  "provider",
  "market",
  "symbol",
  "normalized_symbol",
  "currency",
  "price",
  "status",
  "as_of_ts",
  "fetched_at",
  "source",
  "error_code",
  "error_message",
  "raw_ref_id",
  "updated_at",
].join(", ");

function normalizeMarketPriceStatus(value: unknown, fallback: DaaStoreMarketPriceStatus = "missing"): DaaStoreMarketPriceStatus {
  const status = normalizeText(value, fallback).toLowerCase();
  if (status === "fresh" || status === "stale" || status === "missing" || status === "error" || status === "unsupported") {
    return status;
  }
  return fallback;
}

function normalizeFxHistoryStatus(value: unknown, fallback: DaaStoreFxRateHistoryStatus = "fresh"): DaaStoreFxRateHistoryStatus {
  const status = normalizeText(value, fallback).toLowerCase();
  if (status === "fresh" || status === "stale" || status === "missing" || status === "error") return status;
  return fallback;
}

function hashToken(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function mapMarketPriceSnapshotRow(row: Record<string, unknown>): DaaStoreMarketPriceSnapshot {
  const price = Math.max(0, toFiniteNumber(row.price, 0));
  const status = normalizeMarketPriceStatus(row.status, "missing");
  const semanticUpdatedAt = row.as_of_ts == null ? null : toIsoString(row.as_of_ts, new Date().toISOString());
  const persistedFetchedAt = row.fetched_at == null ? null : toIsoString(row.fetched_at, new Date().toISOString());
  const priceUpdatedAt = price > 0 && status !== "missing" && status !== "error" && status !== "unsupported"
    ? (semanticUpdatedAt || (status === "fresh" ? persistedFetchedAt : null))
    : null;
  return {
    provider: normalizeText(row.provider, "yfinance"),
    market: normalizeUpper(row.market, "US"),
    symbol: normalizeUpper(row.symbol),
    normalizedSymbol: normalizeUpper(row.normalized_symbol || row.symbol),
    currency: normalizeUpper(row.currency, "USD"),
    price,
    status,
    priceUpdatedAt,
    source: normalizeText(row.source, "market_cache"),
    errorCode: row.error_code == null ? null : normalizeText(row.error_code) || null,
    errorMessage: row.error_message == null ? null : normalizeText(row.error_message) || null,
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id) || null,
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function mapMarketPriceHistoryRow(row: Record<string, unknown>): DaaStoreMarketPriceHistory {
  return {
    provider: normalizeText(row.provider, "yfinance"),
    market: normalizeUpper(row.market, "US"),
    symbol: normalizeUpper(row.symbol),
    ts: toIsoString(row.as_of_ts, new Date().toISOString()),
    price: Math.max(0, toFiniteNumber(row.price, 0)),
    currency: normalizeUpper(row.currency, "USD"),
    source: normalizeText(row.source, "market_cache"),
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id) || null,
  };
}

function mapNewsItemSnapshotRow(row: Record<string, unknown>): DaaStoreNewsItemSnapshot {
  return {
    provider: normalizeText(row.provider, "yahoo_rss"),
    symbol: normalizeUpper(row.symbol),
    itemHash: normalizeText(row.item_hash),
    title: normalizeText(row.title),
    link: row.link == null ? null : normalizeText(row.link) || null,
    publishedAt: row.published_at == null ? null : toIsoString(row.published_at, new Date().toISOString()),
    fetchedAt: toIsoString(row.fetched_at, new Date().toISOString()),
    sentimentScore: toFiniteNumber(row.sentiment_score, 0),
    sourceCredibility: clampNumber(toFiniteNumber(row.source_credibility, 0), 0, 1),
    freshness: clampNumber(toFiniteNumber(row.freshness, 0), 0, 1),
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id) || null,
  };
}

function mapNewsSignalSnapshotRow(row: Record<string, unknown>): DaaStoreNewsSignalSnapshot {
  return {
    provider: normalizeText(row.provider, "yahoo_rss"),
    symbol: normalizeUpper(row.symbol),
    scorePct: clampNumber(toFiniteNumber(row.score_pct, 50), 0, 100),
    confidencePct: clampNumber(toFiniteNumber(row.confidence_pct, 0), 0, 100),
    evidenceCount: Math.max(0, Math.trunc(toFiniteNumber(row.evidence_count, 0))),
    reasonsJson: parseJsonb<string[]>(row.reasons_json, []).map((item) => String(item || "").trim()).filter(Boolean),
    generatedAt: toIsoString(row.generated_at, new Date().toISOString()),
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function mapMarketIndicatorSnapshotRow(row: Record<string, unknown>): DaaStoreMarketIndicatorSnapshot {
  return {
    id: normalizeText(row.id),
    key: normalizeMarketIndicatorKey(row.indicator_key) || "vix",
    scope: normalizeText(row.scope, "us_equity"),
    subjectKey: normalizeText(row.subject_key, "GLOBAL"),
    stance: normalizeMarketRegimeStore(row.stance),
    riskOffScorePct: clampNumber(toFiniteNumber(row.risk_off_score_pct, 50), 0, 100),
    confidencePct: clampNumber(toFiniteNumber(row.confidence_pct, 40), 0, 100),
    rawValue: row.raw_value == null ? null : toFiniteNumber(row.raw_value, 0),
    unit: row.unit == null ? null : normalizeText(row.unit) || null,
    percentile252: row.percentile_252 == null ? null : toFiniteNumber(row.percentile_252, 0),
    zscore60: row.zscore_60 == null ? null : toFiniteNumber(row.zscore_60, 0),
    trend1dPct: row.trend_1d_pct == null ? null : toFiniteNumber(row.trend_1d_pct, 0),
    trend7dPct: row.trend_7d_pct == null ? null : toFiniteNumber(row.trend_7d_pct, 0),
    trend30dPct: row.trend_30d_pct == null ? null : toFiniteNumber(row.trend_30d_pct, 0),
    source: normalizeText(row.source, "market_cache"),
    reasonsJson: normalizeStringArray(parseJsonb<unknown[]>(row.reasons_json, [])),
    componentsJson: parseJsonb<Record<string, unknown>>(row.components_json, {}),
    generatedAt: toIsoString(row.generated_at, new Date().toISOString()),
    expireAt: row.expire_at == null ? null : toIsoString(row.expire_at, new Date().toISOString()),
    createdAt: toIsoString(row.created_at, new Date().toISOString()),
  };
}

function mapExternalPayloadRawRow(row: Record<string, unknown>): DaaStoreExternalPayloadRaw {
  return {
    id: normalizeText(row.id),
    provider: normalizeText(row.provider),
    resource: normalizeText(row.resource),
    subjectKey: normalizeText(row.subject_key),
    requestUrl: normalizeText(row.request_url),
    requestJson: parseJsonb<Record<string, unknown>>(row.request_json, {}),
    responseStatus: Math.max(0, Math.trunc(toFiniteNumber(row.response_status, 0))),
    responseHeadersJson: parseJsonb<Record<string, unknown>>(row.response_headers_json, {}),
    payloadJson: row.payload_json == null ? null : parseJsonb<Record<string, unknown>>(row.payload_json, {}),
    payloadText: row.payload_text == null ? null : String(row.payload_text),
    fetchedAt: toIsoString(row.fetched_at, new Date().toISOString()),
    expireAt: toIsoString(row.expire_at, new Date().toISOString()),
    createdAt: toIsoString(row.created_at, new Date().toISOString()),
  };
}

async function appendDaaExternalPayloadRaw(input: {
  provider: string;
  resource: string;
  subjectKey?: string;
  requestUrl?: string;
  requestJson?: Record<string, unknown>;
  responseStatus?: number;
  responseHeadersJson?: Record<string, unknown>;
  payloadJson?: Record<string, unknown> | null;
  payloadText?: string | null;
  fetchedAt?: string;
  expireAt?: string;
}): Promise<DaaStoreExternalPayloadRaw> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const provider = normalizeText(input.provider, "unknown");
    const resource = normalizeText(input.resource, "unknown");
    const subjectKey = normalizeText(input.subjectKey, "");
    const requestUrl = normalizeText(input.requestUrl, "");
    const requestJson = input.requestJson && typeof input.requestJson === "object" ? input.requestJson : {};
    const responseStatus = Math.max(0, Math.trunc(toFiniteNumber(input.responseStatus, 0)));
    const responseHeadersJson = input.responseHeadersJson && typeof input.responseHeadersJson === "object" ? input.responseHeadersJson : {};
    const payloadJson = input.payloadJson && typeof input.payloadJson === "object" ? input.payloadJson : null;
    const payloadText = input.payloadText == null ? null : String(input.payloadText);
    const fetchedAt = toIsoString(input.fetchedAt, new Date().toISOString());
    const expireAt = toIsoString(input.expireAt, new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString());

    await query(
      `INSERT INTO daa_external_payload_raw_v1
        (id, provider, resource, subject_key, request_url, request_json, response_status, response_headers_json, payload_json, payload_text, fetched_at, expire_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10,$11,$12,NOW())`,
      [id, provider, resource, subjectKey, requestUrl, JSON.stringify(requestJson), responseStatus, JSON.stringify(responseHeadersJson), payloadJson == null ? null : JSON.stringify(payloadJson), payloadText, fetchedAt, expireAt],
    );
    const res = await query(
      `SELECT ${RAW_PAYLOAD_SELECT_COLUMNS_} FROM daa_external_payload_raw_v1 WHERE id = $1 LIMIT 1`,
      [id],
    );
    return mapExternalPayloadRawRow(res.rows[0] as Record<string, unknown>);
  });
}

async function deleteExpiredDaaExternalPayloadRaw(nowIso = new Date().toISOString()): Promise<number> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "DELETE FROM daa_external_payload_raw_v1 WHERE expire_at <= $1",
      [toIsoString(nowIso, new Date().toISOString())],
    );
    return Math.max(0, Math.trunc(toFiniteNumber(result.rowCount, 0)));
  });
}

export async function upsertDaaMarketPriceSnapshots(rows: Array<Partial<DaaStoreMarketPriceSnapshot>>): Promise<DaaStoreMarketPriceSnapshot[]> {
  if (!rows.length) return [];
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const out: DaaStoreMarketPriceSnapshot[] = [];
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yfinance");
        const market = normalizeUpper(row.market, "US");
        const symbol = normalizeUpper(row.symbol);
        if (!symbol) continue;
        const normalizedSymbol = normalizeUpper(row.normalizedSymbol, symbol);
        const currency = normalizeUpper(row.currency, "USD");
        const price = Math.max(0, toFiniteNumber(row.price, 0));
        const status = normalizeMarketPriceStatus(row.status, price > 0 ? "fresh" : "missing");
        const priceUpdatedAt = row.priceUpdatedAt ? toIsoString(row.priceUpdatedAt, new Date().toISOString()) : (price > 0 ? new Date().toISOString() : null);
        const persistedFetchedAt = priceUpdatedAt || new Date().toISOString();
        const source = normalizeText(row.source, "market_cache");
        const errorCode = row.errorCode == null ? null : normalizeText(row.errorCode) || null;
        const errorMessage = row.errorMessage == null ? null : normalizeText(row.errorMessage) || null;
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;

        const result = await query(
          `INSERT INTO daa_market_price_snapshot
            (provider, market, symbol, normalized_symbol, currency, price, status, as_of_ts, fetched_at, source, error_code, error_message, raw_ref_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT (provider, market, symbol)
           DO UPDATE SET
             normalized_symbol = EXCLUDED.normalized_symbol,
             currency = EXCLUDED.currency,
             price = EXCLUDED.price,
             status = EXCLUDED.status,
             as_of_ts = EXCLUDED.as_of_ts,
             fetched_at = EXCLUDED.fetched_at,
             source = EXCLUDED.source,
             error_code = EXCLUDED.error_code,
             error_message = EXCLUDED.error_message,
             raw_ref_id = EXCLUDED.raw_ref_id,
             updated_at = NOW()
           RETURNING ${MARKET_PRICE_SNAPSHOT_SELECT_COLUMNS_}`,
          [provider, market, symbol, normalizedSymbol, currency, price, status, priceUpdatedAt, persistedFetchedAt, source, errorCode, errorMessage, rawRefId],
        );
        if (result.rows.length > 0) {
          out.push(mapMarketPriceSnapshotRow(result.rows[0] as Record<string, unknown>));
        }
      }
    });
    return out;
  });
}

export async function getDaaMarketPriceSnapshot(input: {
  provider?: string;
  market: string;
  symbol: string;
}): Promise<DaaStoreMarketPriceSnapshot | null> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const provider = normalizeText(input.provider, "yfinance");
    const market = normalizeUpper(input.market, "US");
    const symbol = normalizeUpper(input.symbol);
    if (!symbol) return null;
    const result = await query(
      `SELECT ${MARKET_PRICE_SNAPSHOT_SELECT_COLUMNS_}
       FROM daa_market_price_snapshot
       WHERE provider = $1 AND market = $2 AND symbol = $3
       LIMIT 1`,
      [provider, market, symbol],
    );
    if (!result.rows.length) return null;
    return mapMarketPriceSnapshotRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaMarketPriceSnapshots(input: {
  provider?: string;
  markets?: string[];
  symbols?: string[];
  limit?: number;
} = {}): Promise<DaaStoreMarketPriceSnapshot[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.provider) {
      params.push(normalizeText(input.provider));
      where.push(`provider = $${params.length}`);
    }
    const markets = Array.isArray(input.markets)
      ? [...new Set(input.markets.map((item) => normalizeUpper(item)).filter(Boolean))]
      : [];
    if (markets.length > 0) {
      params.push(markets);
      where.push(`market = ANY($${params.length})`);
    }
    const symbols = Array.isArray(input.symbols)
      ? [...new Set(input.symbols.map((item) => normalizeUpper(item)).filter(Boolean))]
      : [];
    if (symbols.length > 0) {
      params.push(symbols);
      where.push(`symbol = ANY($${params.length})`);
    }
    const limit = Math.max(1, Math.min(5000, Math.trunc(toFiniteNumber(input.limit, 2000))));
    params.push(limit);
    const result = await query(
      `SELECT ${MARKET_PRICE_SNAPSHOT_SELECT_COLUMNS_}
       FROM daa_market_price_snapshot
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY fetched_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapMarketPriceSnapshotRow(row as Record<string, unknown>));
  });
}

export async function listLatestDaaMarketPriceHistoryRows(input: {
  provider?: string;
  markets?: string[];
  symbols?: string[];
  limit?: number;
} = {}): Promise<DaaStoreMarketPriceHistory[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const where: string[] = ["price > 0"];
    const params: unknown[] = [];
    if (input.provider) {
      params.push(normalizeText(input.provider));
      where.push(`provider = $${params.length}`);
    }
    const markets = Array.isArray(input.markets)
      ? [...new Set(input.markets.map((item) => normalizeUpper(item)).filter(Boolean))]
      : [];
    if (markets.length > 0) {
      params.push(markets);
      where.push(`market = ANY($${params.length})`);
    }
    const symbols = Array.isArray(input.symbols)
      ? [...new Set(input.symbols.map((item) => normalizeUpper(item)).filter(Boolean))]
      : [];
    if (symbols.length > 0) {
      params.push(symbols);
      where.push(`symbol = ANY($${params.length})`);
    }
    const limit = Math.max(1, Math.min(5000, Math.trunc(toFiniteNumber(input.limit, 2000))));
    params.push(limit);
    const result = await query(
      `SELECT provider, market, symbol, as_of_ts, price, currency, source, raw_ref_id
       FROM (
         SELECT DISTINCT ON (provider, market, symbol)
           provider, market, symbol, as_of_ts, price, currency, source, raw_ref_id
         FROM daa_market_price_history_v1
         WHERE ${where.join(" AND ")}
         ORDER BY provider, market, symbol, as_of_ts DESC
       ) latest
       ORDER BY as_of_ts DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapMarketPriceHistoryRow(row as Record<string, unknown>));
  });
}

export async function appendDaaMarketPriceHistoryRows(rows: Array<Partial<DaaStoreMarketPriceHistory>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let inserted = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yfinance");
        const market = normalizeUpper(row.market, "US");
        const symbol = normalizeUpper(row.symbol);
        const price = Math.max(0, toFiniteNumber(row.price, 0));
        if (!symbol || !(price > 0)) continue;
        const ts = toIsoString(row.ts, new Date().toISOString());
        const currency = normalizeUpper(row.currency, "USD");
        const source = normalizeText(row.source, "market_cache");
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;
        await query(
          `INSERT INTO daa_market_price_history_v1
            (provider, market, symbol, as_of_ts, price, currency, source, fetched_at, raw_ref_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (provider, market, symbol, as_of_ts)
           DO UPDATE SET
             price = EXCLUDED.price,
             currency = EXCLUDED.currency,
             source = EXCLUDED.source,
             fetched_at = EXCLUDED.fetched_at,
             raw_ref_id = EXCLUDED.raw_ref_id`,
          [provider, market, symbol, ts, price, currency, source, ts, rawRefId],
        );
        inserted += 1;
      }
    });
    return inserted;
  });
}

export async function appendDaaFxRateHistoryRows(rows: Array<Partial<DaaStoreFxRateHistory>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let inserted = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yfinance");
        const baseCcy = normalizeUpper(row.baseCcy, "USD");
        const quoteCcy = normalizeUpper(row.quoteCcy, "USD");
        const status = normalizeFxHistoryStatus(row.status, "fresh");
        const rate = Math.max(0, toFiniteNumber(row.rate, 0));
        if (!baseCcy || !quoteCcy) continue;
        if (!(rate > 0) && status !== "error" && status !== "missing") continue;
        const asOfTs = toIsoString(row.asOfTs, new Date().toISOString());
        const fetchedAt = toIsoString(row.fetchedAt, new Date().toISOString());
        const errorCode = row.errorCode == null ? null : normalizeText(row.errorCode) || null;
        const errorMessage = row.errorMessage == null ? null : normalizeText(row.errorMessage) || null;
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;

        await query(
          `INSERT INTO daa_fx_rate_history_v1
            (provider, base_ccy, quote_ccy, as_of_ts, rate, status, fetched_at, error_code, error_message, raw_ref_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (provider, base_ccy, quote_ccy, as_of_ts)
           DO UPDATE SET
             rate = EXCLUDED.rate,
             status = EXCLUDED.status,
             fetched_at = EXCLUDED.fetched_at,
             error_code = EXCLUDED.error_code,
             error_message = EXCLUDED.error_message,
             raw_ref_id = EXCLUDED.raw_ref_id`,
          [provider, baseCcy, quoteCcy, asOfTs, rate, status, fetchedAt, errorCode, errorMessage, rawRefId],
        );
        inserted += 1;
      }
    });
    return inserted;
  });
}

export async function upsertDaaNewsItemSnapshots(rows: Array<Partial<DaaStoreNewsItemSnapshot>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yahoo_rss");
        const symbol = normalizeUpper(row.symbol);
        const title = normalizeText(row.title);
        if (!symbol || !title) continue;
        const link = row.link == null ? null : normalizeText(row.link) || null;
        const publishedAt = row.publishedAt ? toIsoString(row.publishedAt, new Date().toISOString()) : null;
        const itemHash = normalizeText(row.itemHash) || hashToken(`${symbol}::${title}::${link || ""}::${publishedAt || ""}`);
        const fetchedAt = toIsoString(row.fetchedAt, new Date().toISOString());
        const sentimentScore = toFiniteNumber(row.sentimentScore, 0);
        const sourceCredibility = clampNumber(toFiniteNumber(row.sourceCredibility, 0), 0, 1);
        const freshness = clampNumber(toFiniteNumber(row.freshness, 0), 0, 1);
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;
        await query(
          `INSERT INTO daa_news_item_snapshot_v1
            (provider, symbol, item_hash, title, link, published_at, fetched_at, sentiment_score, source_credibility, freshness, raw_ref_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (provider, symbol, item_hash)
           DO UPDATE SET
             title = EXCLUDED.title,
             link = EXCLUDED.link,
             published_at = EXCLUDED.published_at,
             fetched_at = EXCLUDED.fetched_at,
             sentiment_score = EXCLUDED.sentiment_score,
             source_credibility = EXCLUDED.source_credibility,
             freshness = EXCLUDED.freshness,
             raw_ref_id = EXCLUDED.raw_ref_id`,
          [provider, symbol, itemHash, title, link, publishedAt, fetchedAt, sentimentScore, sourceCredibility, freshness, rawRefId],
        );
        touched += 1;
      }
    });
    return touched;
  });
}

export async function listDaaNewsItemsBySymbol(input: {
  provider?: string;
  symbol: string;
  limit?: number;
}): Promise<DaaStoreNewsItemSnapshot[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const provider = normalizeText(input.provider, "yahoo_rss");
    const symbol = normalizeUpper(input.symbol);
    if (!symbol) return [];
    const limit = Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(input.limit, 20))));
    const result = await query(
      `SELECT ${NEWS_ITEM_SNAPSHOT_SELECT_COLUMNS_}
       FROM daa_news_item_snapshot_v1
       WHERE provider = $1 AND symbol = $2
       ORDER BY COALESCE(published_at, fetched_at) DESC
       LIMIT $3`,
      [provider, symbol, limit],
    );
    return result.rows.map((row) => mapNewsItemSnapshotRow(row as Record<string, unknown>));
  });
}

export async function upsertDaaNewsSignalSnapshots(rows: Array<Partial<DaaStoreNewsSignalSnapshot>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yahoo_rss");
        const symbol = normalizeUpper(row.symbol);
        if (!symbol) continue;
        const scorePct = clampNumber(toFiniteNumber(row.scorePct, 50), 0, 100);
        const confidencePct = clampNumber(toFiniteNumber(row.confidencePct, 0), 0, 100);
        const evidenceCount = Math.max(0, Math.trunc(toFiniteNumber(row.evidenceCount, 0)));
        const reasonsJson = Array.isArray(row.reasonsJson) ? row.reasonsJson.map((item) => String(item || "").trim()).filter(Boolean) : [];
        const generatedAt = toIsoString(row.generatedAt, new Date().toISOString());
        const result = await query(
          `INSERT INTO daa_news_signal_snapshot_v1
            (provider, symbol, score_pct, confidence_pct, evidence_count, reasons_json, generated_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())
           ON CONFLICT (provider, symbol)
           DO UPDATE SET
             score_pct = EXCLUDED.score_pct,
             confidence_pct = EXCLUDED.confidence_pct,
             evidence_count = EXCLUDED.evidence_count,
             reasons_json = EXCLUDED.reasons_json,
             generated_at = EXCLUDED.generated_at,
             updated_at = NOW()
           RETURNING provider`,
          [provider, symbol, scorePct, confidencePct, evidenceCount, JSON.stringify(reasonsJson), generatedAt],
        );
        if (result.rows.length > 0) touched += 1;
      }
    });
    return touched;
  });
}

export async function getDaaNewsSignalSnapshotBySymbol(input: {
  provider?: string;
  symbol: string;
}): Promise<DaaStoreNewsSignalSnapshot | null> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const provider = normalizeText(input.provider, "yahoo_rss");
    const symbol = normalizeUpper(input.symbol);
    if (!symbol) return null;
    const result = await query(
      `SELECT ${NEWS_SIGNAL_SNAPSHOT_SELECT_COLUMNS_}
       FROM daa_news_signal_snapshot_v1
       WHERE provider = $1 AND symbol = $2
       LIMIT 1`,
      [provider, symbol],
    );
    if (!result.rows.length) return null;
    return mapNewsSignalSnapshotRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function upsertDaaMarketIndicatorSnapshots(rows: Array<Partial<DaaStoreMarketIndicatorSnapshot> & Record<string, unknown>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const indicatorKey = normalizeMarketIndicatorKey(row.indicatorKey ?? row.key);
        if (!indicatorKey) continue;
        const scope = normalizeText(row.scope, "us_equity");
        const subjectKey = normalizeText(row.subjectKey, "GLOBAL").toUpperCase();
        const generatedAt = toIsoString(row.generatedAt, new Date().toISOString());
        const id = normalizeText(row.id, "") || hashToken(`${indicatorKey}::${scope}::${subjectKey}::${generatedAt}`);
        const stance = normalizeMarketRegimeStore(row.stance);
        const riskOffScorePct = clampNumber(toFiniteNumber(row.riskOffScorePct, 50), 0, 100);
        const confidencePct = clampNumber(toFiniteNumber(row.confidencePct, 40), 0, 100);
        const rawValue = row.rawValue == null ? null : toFiniteNumber(row.rawValue, 0);
        const unit = row.unit == null ? null : normalizeText(row.unit) || null;
        const percentile252 = row.percentile252 == null ? null : toFiniteNumber(row.percentile252, 0);
        const zscore60 = row.zscore60 == null ? null : toFiniteNumber(row.zscore60, 0);
        const trend1dPct = row.trend1dPct == null ? null : toFiniteNumber(row.trend1dPct, 0);
        const trend7dPct = row.trend7dPct == null ? null : toFiniteNumber(row.trend7dPct, 0);
        const trend30dPct = row.trend30dPct == null ? null : toFiniteNumber(row.trend30dPct, 0);
        const source = normalizeText(row.source, "market_cache");
        const reasonsJson = normalizeStringArray(Array.isArray(row.reasonsJson) ? row.reasonsJson : []);
        const componentsJson = row.componentsJson && typeof row.componentsJson === "object" ? row.componentsJson as Record<string, unknown> : {};
        const expireAt = row.expireAt == null ? null : toIsoString(row.expireAt, new Date().toISOString());
        const result = await query(
          `INSERT INTO daa_market_indicator_snapshot_v1
            (id, indicator_key, scope, subject_key, stance, risk_off_score_pct, confidence_pct, raw_value, unit, percentile_252, zscore_60, trend_1d_pct, trend_7d_pct, trend_30d_pct, source, reasons_json, components_json, generated_at, expire_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,NOW())
           ON CONFLICT (id)
           DO UPDATE SET
             stance = EXCLUDED.stance,
             risk_off_score_pct = EXCLUDED.risk_off_score_pct,
             confidence_pct = EXCLUDED.confidence_pct,
             raw_value = EXCLUDED.raw_value,
             unit = EXCLUDED.unit,
             percentile_252 = EXCLUDED.percentile_252,
             zscore_60 = EXCLUDED.zscore_60,
             trend_1d_pct = EXCLUDED.trend_1d_pct,
             trend_7d_pct = EXCLUDED.trend_7d_pct,
             trend_30d_pct = EXCLUDED.trend_30d_pct,
             source = EXCLUDED.source,
             reasons_json = EXCLUDED.reasons_json,
             components_json = EXCLUDED.components_json,
             generated_at = EXCLUDED.generated_at,
             expire_at = EXCLUDED.expire_at
           RETURNING id`,
          [
            id,
            indicatorKey,
            scope,
            subjectKey,
            stance,
            riskOffScorePct,
            confidencePct,
            rawValue,
            unit,
            percentile252,
            zscore60,
            trend1dPct,
            trend7dPct,
            trend30dPct,
            source,
            JSON.stringify(reasonsJson),
            JSON.stringify(componentsJson),
            generatedAt,
            expireAt,
          ],
        );
        if (result.rows.length > 0) touched += 1;
      }
    });
    return touched;
  });
}

export async function listLatestDaaMarketIndicatorSnapshots(): Promise<DaaStoreMarketIndicatorSnapshot[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const supportedKeys = ["vix", "qqq_spy_ratio", "fxi_volatility", "kweb_fxi_ratio", "btc_eth_ratio", "btc_volatility", "gold_silver_ratio"];
    const result = await query(
      `SELECT DISTINCT ON (indicator_key) ${MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_}
       FROM daa_market_indicator_snapshot_v1
       WHERE indicator_key = ANY($1::text[])
       ORDER BY indicator_key, generated_at DESC`,
      [supportedKeys],
    );
    return result.rows.map((row) => mapMarketIndicatorSnapshotRow(row as Record<string, unknown>));
  });
}

export async function listDaaMarketIndicatorHistory(input: {
  keys: DaaMarketIndicatorKey[];
  days: number;
  scope?: string | null;
}): Promise<DaaStoreMarketIndicatorSnapshot[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const keys = [...new Set((input.keys || []).map((item) => normalizeMarketIndicatorKey(item)).filter(Boolean))] as DaaMarketIndicatorKey[];
    if (!keys.length) return [];
    const days = Math.max(1, Math.min(365, Math.trunc(toFiniteNumber(input.days, 90))));
    const since = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
    const scope = normalizeText(input.scope, "");
    const result = scope
      ? await query(
        `SELECT ${MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_}
         FROM daa_market_indicator_snapshot_v1
         WHERE indicator_key = ANY($1::text[])
           AND scope = $2
           AND generated_at >= $3
         ORDER BY indicator_key ASC, generated_at ASC`,
        [keys, scope, since],
      )
      : await query(
        `SELECT ${MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_}
         FROM daa_market_indicator_snapshot_v1
         WHERE indicator_key = ANY($1::text[])
           AND generated_at >= $2
         ORDER BY indicator_key ASC, generated_at ASC`,
        [keys, since],
      );
    return result.rows.map((row) => mapMarketIndicatorSnapshotRow(row as Record<string, unknown>));
  });
}

export async function replaceDaaHfHoldingSnapshots(rows: Array<Partial<DaaStoreHfHoldingSnapshot>>, provider = "danjuan"): Promise<number> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      await query("DELETE FROM daa_hf_holding_snapshot_v1 WHERE provider = $1", [normalizeText(provider, "danjuan")]);
      for (const row of rows) {
        const providerFinal = normalizeText(row.provider, provider);
        const fundCode = normalizeText(row.fundCode);
        const symbol = normalizeUpper(row.symbol);
        if (!fundCode || !symbol) continue;
        const reportDate = normalizeText(row.reportDate);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) continue;
        const market = normalizeUpper(row.market, "UNKNOWN");
        const weightPct = Math.max(0, toFiniteNumber(row.weightPct, 0));
        const prevWeightPct = Math.max(0, toFiniteNumber(row.prevWeightPct, 0));
        const disclosedAt = row.disclosedAt ? toIsoString(row.disclosedAt, new Date().toISOString()) : null;
        const confidencePct = clampNumber(toFiniteNumber(row.confidencePct, 0), 0, 100);
        const sourceRef = row.sourceRef == null ? null : normalizeText(row.sourceRef) || null;
        const fetchedAt = toIsoString(row.fetchedAt, new Date().toISOString());
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;
        await query(
          `INSERT INTO daa_hf_holding_snapshot_v1
            (provider, fund_code, report_date, symbol, market, weight_pct, prev_weight_pct, disclosed_at, confidence_pct, source_ref, fetched_at, raw_ref_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (provider, fund_code, report_date, symbol)
           DO UPDATE SET
             market = EXCLUDED.market,
             weight_pct = EXCLUDED.weight_pct,
             prev_weight_pct = EXCLUDED.prev_weight_pct,
             disclosed_at = EXCLUDED.disclosed_at,
             confidence_pct = EXCLUDED.confidence_pct,
             source_ref = EXCLUDED.source_ref,
             fetched_at = EXCLUDED.fetched_at,
             raw_ref_id = EXCLUDED.raw_ref_id`,
          [providerFinal, fundCode, reportDate, symbol, market, weightPct, prevWeightPct, disclosedAt, confidencePct, sourceRef, fetchedAt, rawRefId],
        );
        touched += 1;
      }
    });
    return touched;
  });
}

export async function upsertDaaHfSignalSnapshots(rows: Array<Partial<DaaStoreHfSignalSnapshot>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "human_signal");
        const symbol = normalizeUpper(row.symbol);
        if (!symbol) continue;
        const aggregatedScorePct = clampNumber(toFiniteNumber(row.aggregatedScorePct, 0), 0, 100);
        const convictionPct = clampNumber(toFiniteNumber(row.convictionPct, 0), 0, 100);
        const thesisDriftPct = clampNumber(toFiniteNumber(row.thesisDriftPct, 0), 0, 100);
        const fundCount = Math.max(0, Math.trunc(toFiniteNumber(row.fundCount, 0)));
        const fundsJson = Array.isArray(row.fundsJson) ? row.fundsJson : [];
        const generatedAt = toIsoString(row.generatedAt, new Date().toISOString());
        await query(
          `INSERT INTO daa_hf_signal_snapshot_v1
            (provider, symbol, aggregated_score_pct, conviction_pct, thesis_drift_pct, fund_count, funds_json, generated_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW())
           ON CONFLICT (provider, symbol)
           DO UPDATE SET
             aggregated_score_pct = EXCLUDED.aggregated_score_pct,
             conviction_pct = EXCLUDED.conviction_pct,
             thesis_drift_pct = EXCLUDED.thesis_drift_pct,
             fund_count = EXCLUDED.fund_count,
             funds_json = EXCLUDED.funds_json,
             generated_at = EXCLUDED.generated_at,
             updated_at = NOW()`,
          [provider, symbol, aggregatedScorePct, convictionPct, thesisDriftPct, fundCount, JSON.stringify(fundsJson), generatedAt],
        );
        touched += 1;
      }
    });
    return touched;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Macro Cycle Snapshots
// ─────────────────────────────────────────────────────────────────────────────

export type MacroCycleSnapshotRow = {
  id: string;
  phase: string;
  growthProxy: number;
  inflationProxy: number;
  confidence: number;
  label: string;
  favoredAssets: string[];
  dataSource: string;
  fredGdpPct: number | null;
  fredCpiPct: number | null;
  fredUnemploymentPct: number | null;
  createdAt: string;
};

export async function upsertMacroCycleSnapshot(input: {
  phase: string;
  growthProxy: number;
  inflationProxy: number;
  confidence: number;
  label: string;
  favoredAssets: string[];
  dataSource: string;
  fredGdpPct?: number | null;
  fredCpiPct?: number | null;
  fredUnemploymentPct?: number | null;
}): Promise<void> {
  return withDaaPgClient(async (client) => {
    await client.query(
      `INSERT INTO daa_macro_cycle_snapshots (
         id, phase, growth_proxy, inflation_proxy, confidence, label,
         favored_assets, data_source, fred_gdp_pct, fred_cpi_pct, fred_unemployment_pct,
         created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [
        randomUUID(),
        input.phase,
        input.growthProxy,
        input.inflationProxy,
        input.confidence,
        input.label,
        input.favoredAssets,
        input.dataSource,
        input.fredGdpPct ?? null,
        input.fredCpiPct ?? null,
        input.fredUnemploymentPct ?? null,
      ],
    );
  });
}

export async function listMacroCycleHistory(limit = 30): Promise<MacroCycleSnapshotRow[]> {
  return withDaaPgClient(async (client) => {
    const result = await client.query(
      `SELECT id, phase, growth_proxy, inflation_proxy, confidence, label,
              favored_assets, data_source, fred_gdp_pct, fred_cpi_pct, fred_unemployment_pct, created_at
       FROM daa_macro_cycle_snapshots
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(200, Math.trunc(limit)))],
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      id: normalizeText(row.id),
      phase: normalizeText(row.phase),
      growthProxy: toFinite(row.growth_proxy, 0),
      inflationProxy: toFinite(row.inflation_proxy, 0),
      confidence: toFinite(row.confidence, 0),
      label: normalizeText(row.label),
      favoredAssets: normalizeStringArray(row.favored_assets),
      dataSource: normalizeText(row.data_source, "proxy"),
      fredGdpPct: row.fred_gdp_pct == null ? null : toFinite(row.fred_gdp_pct, 0),
      fredCpiPct: row.fred_cpi_pct == null ? null : toFinite(row.fred_cpi_pct, 0),
      fredUnemploymentPct: row.fred_unemployment_pct == null ? null : toFinite(row.fred_unemployment_pct, 0),
      createdAt: toIsoString(row.created_at, new Date().toISOString()),
    }));
  });
}

