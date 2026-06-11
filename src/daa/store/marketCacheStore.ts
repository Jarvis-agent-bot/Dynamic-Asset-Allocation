/**
 * Market-cache store functions.
 */

import { createHash, randomUUID } from "node:crypto";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import type { DaaMarketIndicatorKey } from "@/src/daa/modules/marketContext/marketContextTypes";
import { MARKET_INDICATOR_KEYS_ } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import {
  withDaaPgClient, parseJsonb, toIsoString, withPgTransaction, clampNumber, normalizeUpper, normalizeStringArray,
  isRecord,
} from "./storeShared";
import type {
  DaaStoreMarketPriceSnapshot, DaaStoreMarketPriceStatus, DaaStoreMarketPriceHistory,
  DaaStoreFxRateHistory, DaaStoreFxRateHistoryStatus,
  DaaStoreNewsItemSnapshot,
  DaaStoreNewsEventSnapshot,
  DaaStoreNewsRelatedAsset,
  DaaStoreNewsEventGraph, DaaStoreNewsEventRelatedAssetEdge, DaaStoreNewsImpactLevel, DaaStoreNewsImpactScope,
  DaaStoreNewsPortfolioImpact, DaaStoreNewsRecommendedAction,
  DaaStoreDiscoveryCandidate, DaaStoreDiscoveryCandidateConfidence,
  DaaStoreDiscoveryCandidateStatus,
  DaaStoreMarketIndicatorSnapshot, DaaStoreHfHoldingSnapshot, DaaStoreHfSignalSnapshot,
} from "./storeTypes";
import { ensureDaaMarketCacheSchemaPg } from "./storeSchema";
import { normalizeMarketIndicatorKey, normalizeMarketRegimeStore } from "./marketIndicatorNormalizers";

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

const NEWS_EVENT_SNAPSHOT_SELECT_COLUMNS_ = [
  "provider",
  "symbol",
  "event_hash",
  "item_hash",
  "title",
  "link",
  "source",
  "published_at",
  "score_pct",
  "confidence_pct",
  "llm_summary",
  "llm_drivers_json",
  "llm_major_event_json",
  "llm_action_hint",
  "analyzed_at",
  "updated_at",
].join(", ");

const NEWS_EVENT_GRAPH_SELECT_COLUMNS_ = [
  "provider",
  "symbol",
  "event_hash",
  "item_hash",
  "theme_key",
  "theme_label_zh",
  "related_assets_json",
  "event_score_pct",
  "reasons_json",
  "generated_at",
  "updated_at",
].join(", ");

const NEWS_EVENT_RELATED_ASSET_SELECT_COLUMNS_ = [
  "provider",
  "symbol",
  "event_hash",
  "theme_key",
  "related_asset_key",
  "related_symbol",
  "related_market",
  "relation",
  "confidence_pct",
  "reason_zh",
  "generated_at",
  "updated_at",
].join(", ");

const NEWS_PORTFOLIO_IMPACT_SELECT_COLUMNS_ = [
  "id",
  "owner_account_id",
  "provider",
  "symbol",
  "event_hash",
  "asset_key",
  "impact_scope",
  "impact_level",
  "impact_score_pct",
  "recommended_action",
  "reason_zh",
  "generated_at",
  "updated_at",
].join(", ");

const DISCOVERY_CANDIDATE_SELECT_COLUMNS_ = [
  "id",
  "owner_account_id",
  "topic_key",
  "topic_label_zh",
  "asset_key",
  "symbol",
  "market",
  "name",
  "display_name_zh",
  "score_pct",
  "confidence",
  "status",
  "reason_zh",
  "risk_notes_json",
  "evidence_refs_json",
  "discovered_at",
  "last_seen_at",
  "seen_count",
  "reviewed_at",
  "promoted_at",
  "dismissed_at",
  "archived_at",
  "status_updated_at",
  "updated_at",
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
    fetchedAt: toIsoString(row.fetched_at, new Date().toISOString()),
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

function normalizeNewsDrivers(value: unknown): DaaStoreNewsEventSnapshot["llmDrivers"] {
  const raw = parseJsonb<Record<string, unknown> | null>(value, null);
  if (!raw) return null;
  const bullish = Array.isArray(raw.bullish) ? raw.bullish.map((item) => normalizeText(item)).filter(Boolean) : [];
  const bearish = Array.isArray(raw.bearish) ? raw.bearish.map((item) => normalizeText(item)).filter(Boolean) : [];
  if (bullish.length === 0 && bearish.length === 0) return null;
  return { bullish, bearish };
}

function normalizeNewsMajorEvent(value: unknown): DaaStoreNewsEventSnapshot["llmMajorEvent"] {
  const raw = parseJsonb<Record<string, unknown> | null>(value, null);
  if (!raw) return null;
  const type = normalizeText(raw.type, "other").toLowerCase();
  const rawImpact = normalizeText(raw.impact, "medium").toLowerCase();
  const impact = rawImpact === "high" || rawImpact === "medium" || rawImpact === "low" ? rawImpact : "medium";
  const description = normalizeText(raw.description);
  if (!type && !description) return null;
  return { type: type || "other", impact, description };
}

function normalizeNewsRelatedAssetRelation(value: unknown): string {
  const relation = normalizeText(value, "related").toLowerCase();
  if (relation === "source" || relation === "same_theme" || relation === "related") return relation;
  return "related";
}

function mapNewsEventSnapshotRow(row: Record<string, unknown>): DaaStoreNewsEventSnapshot {
  return {
    provider: normalizeText(row.provider, "multi"),
    symbol: normalizeUpper(row.symbol),
    eventHash: normalizeText(row.event_hash),
    itemHash: normalizeText(row.item_hash),
    title: normalizeText(row.title),
    link: row.link == null ? null : normalizeText(row.link) || null,
    source: row.source == null ? null : normalizeText(row.source) || null,
    publishedAt: row.published_at == null ? null : toIsoString(row.published_at, new Date().toISOString()),
    scorePct: clampNumber(toFiniteNumber(row.score_pct, 50), 0, 100),
    confidencePct: clampNumber(toFiniteNumber(row.confidence_pct, 0), 0, 100),
    llmSummary: row.llm_summary == null ? null : normalizeText(row.llm_summary) || null,
    llmDrivers: normalizeNewsDrivers(row.llm_drivers_json),
    llmMajorEvent: normalizeNewsMajorEvent(row.llm_major_event_json),
    llmActionHint: row.llm_action_hint == null ? null : normalizeText(row.llm_action_hint) || null,
    analyzedAt: toIsoString(row.analyzed_at, new Date().toISOString()),
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function pickRecordValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function normalizeNewsRelatedAssets(value: unknown): DaaStoreNewsRelatedAsset[] {
  const raw = parseJsonb<unknown[]>(value, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!isRecord(item)) return [];
    const assetKey = normalizeText(pickRecordValue(item, ["assetKey", "asset_key"])).toUpperCase();
    const symbol = normalizeUpper(pickRecordValue(item, ["symbol"]));
    const market = normalizeUpper(pickRecordValue(item, ["market"]), "US");
    if (!assetKey || !symbol) return [];
    return [{
      assetKey,
      symbol,
      market,
      name: pickRecordValue(item, ["name"]) == null ? null : normalizeText(pickRecordValue(item, ["name"])) || null,
      displayNameZh: pickRecordValue(item, ["displayNameZh", "display_name_zh"]) == null
        ? null
        : normalizeText(pickRecordValue(item, ["displayNameZh", "display_name_zh"])) || null,
      relation: normalizeNewsRelatedAssetRelation(pickRecordValue(item, ["relation"])),
      confidencePct: clampNumber(toFiniteNumber(pickRecordValue(item, ["confidencePct", "confidence_pct"]), 50), 0, 100),
      reasonZh: normalizeText(pickRecordValue(item, ["reasonZh", "reason_zh"]), "同一事件主题下的关联资产"),
    }];
  });
}

function normalizeNewsImpactScope(value: unknown, fallback: DaaStoreNewsImpactScope = "related_candidate"): DaaStoreNewsImpactScope {
  const scope = normalizeText(value, fallback).toLowerCase();
  if (scope === "holding" || scope === "watchlist" || scope === "target" || scope === "related_candidate") return scope;
  return fallback;
}

function normalizeNewsImpactLevel(value: unknown, fallback: DaaStoreNewsImpactLevel = "watch"): DaaStoreNewsImpactLevel {
  const level = normalizeText(value, fallback).toLowerCase();
  if (level === "none" || level === "watch" || level === "review" || level === "risk") return level;
  return fallback;
}

function normalizeNewsRecommendedAction(value: unknown, fallback: DaaStoreNewsRecommendedAction = "investigate"): DaaStoreNewsRecommendedAction {
  const action = normalizeText(value, fallback).toLowerCase();
  if (action === "record" || action === "investigate" || action === "review_thesis" || action === "candidate_watchlist") return action;
  return fallback;
}

function normalizeDiscoveryCandidateStatus(value: unknown, fallback: DaaStoreDiscoveryCandidateStatus = "new"): DaaStoreDiscoveryCandidateStatus {
  const status = normalizeText(value, fallback).toLowerCase();
  if (status === "new" || status === "watching" || status === "dismissed" || status === "archived") return status;
  return fallback;
}

function normalizeDiscoveryCandidateConfidence(value: unknown, fallback: DaaStoreDiscoveryCandidateConfidence = "medium"): DaaStoreDiscoveryCandidateConfidence {
  const confidence = normalizeText(value, fallback).toLowerCase();
  if (confidence === "low" || confidence === "medium" || confidence === "high") return confidence;
  return fallback;
}

function mapNewsEventGraphRow(row: Record<string, unknown>): DaaStoreNewsEventGraph {
  return {
    provider: normalizeText(row.provider, "multi"),
    symbol: normalizeUpper(row.symbol),
    eventHash: normalizeText(row.event_hash),
    itemHash: normalizeText(row.item_hash),
    themeKey: normalizeText(row.theme_key, "general"),
    themeLabelZh: normalizeText(row.theme_label_zh, "综合事件"),
    relatedAssets: normalizeNewsRelatedAssets(row.related_assets_json),
    eventScorePct: clampNumber(toFiniteNumber(row.event_score_pct, 50), 0, 100),
    reasons: normalizeStringArray(parseJsonb<unknown[]>(row.reasons_json, [])),
    generatedAt: toIsoString(row.generated_at, new Date().toISOString()),
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function mapNewsEventRelatedAssetEdgeRow(row: Record<string, unknown>): DaaStoreNewsEventRelatedAssetEdge {
  return {
    provider: normalizeText(row.provider, "multi"),
    symbol: normalizeUpper(row.symbol),
    eventHash: normalizeText(row.event_hash),
    themeKey: normalizeText(row.theme_key, "general"),
    relatedAssetKey: normalizeText(row.related_asset_key).toUpperCase(),
    relatedSymbol: normalizeUpper(row.related_symbol),
    relatedMarket: normalizeUpper(row.related_market, "US"),
    relation: normalizeNewsRelatedAssetRelation(row.relation),
    confidencePct: clampNumber(toFiniteNumber(row.confidence_pct, 50), 0, 100),
    reasonZh: normalizeText(row.reason_zh, "同一事件主题下的关联资产"),
    generatedAt: toIsoString(row.generated_at, new Date().toISOString()),
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function mapNewsPortfolioImpactRow(row: Record<string, unknown>): DaaStoreNewsPortfolioImpact {
  return {
    id: normalizeText(row.id),
    ownerAccountId: normalizeText(row.owner_account_id, getDaaAccountScopeId()),
    provider: normalizeText(row.provider, "multi"),
    symbol: normalizeUpper(row.symbol),
    eventHash: normalizeText(row.event_hash),
    assetKey: normalizeText(row.asset_key).toUpperCase(),
    impactScope: normalizeNewsImpactScope(row.impact_scope),
    impactLevel: normalizeNewsImpactLevel(row.impact_level),
    impactScorePct: clampNumber(toFiniteNumber(row.impact_score_pct, 0), 0, 100),
    recommendedAction: normalizeNewsRecommendedAction(row.recommended_action),
    reasonZh: normalizeText(row.reason_zh, "新闻事件可能影响该资产"),
    generatedAt: toIsoString(row.generated_at, new Date().toISOString()),
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function mapDiscoveryCandidateRow(row: Record<string, unknown>): DaaStoreDiscoveryCandidate {
  const status = normalizeDiscoveryCandidateStatus(row.status);
  return {
    id: normalizeText(row.id),
    ownerAccountId: normalizeText(row.owner_account_id, getDaaAccountScopeId()),
    topicKey: normalizeText(row.topic_key, "general"),
    topicLabelZh: normalizeText(row.topic_label_zh, "综合主题"),
    assetKey: normalizeText(row.asset_key).toUpperCase(),
    symbol: normalizeUpper(row.symbol),
    market: normalizeUpper(row.market, "US"),
    name: row.name == null ? null : normalizeText(row.name) || null,
    displayNameZh: row.display_name_zh == null ? null : normalizeText(row.display_name_zh) || null,
    scorePct: clampNumber(toFiniteNumber(row.score_pct, 0), 0, 100),
    confidence: normalizeDiscoveryCandidateConfidence(row.confidence),
    status,
    reasonZh: normalizeText(row.reason_zh, "新闻主题触发的候选研究资产"),
    riskNotesZh: normalizeStringArray(parseJsonb<unknown[]>(row.risk_notes_json, [])),
    evidenceRefs: normalizeStringArray(parseJsonb<unknown[]>(row.evidence_refs_json, [])),
    discoveredAt: toIsoString(row.discovered_at, new Date().toISOString()),
    lastSeenAt: toIsoString(row.last_seen_at, new Date().toISOString()),
    seenCount: Math.max(1, Math.trunc(toFiniteNumber(row.seen_count, 1))),
    reviewedAt: row.reviewed_at == null ? null : toIsoString(row.reviewed_at),
    promotedAt: row.promoted_at == null ? null : toIsoString(row.promoted_at),
    dismissedAt: row.dismissed_at == null ? null : toIsoString(row.dismissed_at),
    archivedAt: row.archived_at == null ? null : toIsoString(row.archived_at),
    statusUpdatedAt: toIsoString(row.status_updated_at, new Date().toISOString()),
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

export async function upsertDaaMarketPriceSnapshots(
  rows: Array<Partial<DaaStoreMarketPriceSnapshot> & { fetchedAt?: string | null }>,
): Promise<DaaStoreMarketPriceSnapshot[]> {
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
        const nowIso = new Date().toISOString();
        const priceUpdatedAt = row.priceUpdatedAt ? toIsoString(row.priceUpdatedAt, nowIso) : (price > 0 ? nowIso : null);
        const persistedFetchedAt = row.fetchedAt ? toIsoString(row.fetchedAt, nowIso) : nowIso;
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
        const fetchedAt = toIsoString(row.fetchedAt, new Date().toISOString());
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
          [provider, market, symbol, ts, price, currency, source, fetchedAt, rawRefId],
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
    const symbol = normalizeUpper(input.symbol);
    if (!symbol) return [];
    const provider = input.provider == null ? "" : normalizeText(input.provider);
    const limit = Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(input.limit, 20))));
    const where = ["symbol = $1"];
    const params: unknown[] = [symbol];
    if (provider) {
      params.push(provider);
      where.push(`provider = $${params.length}`);
    }
    params.push(limit);
    const result = await query(
      `SELECT ${NEWS_ITEM_SNAPSHOT_SELECT_COLUMNS_}
       FROM daa_news_item_snapshot_v1
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(published_at, fetched_at) DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapNewsItemSnapshotRow(row as Record<string, unknown>));
  });
}

export async function upsertDaaNewsEventSnapshots(rows: Array<Partial<DaaStoreNewsEventSnapshot>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "multi");
        const symbol = normalizeUpper(row.symbol);
        const title = normalizeText(row.title);
        if (!symbol || !title) continue;
        const link = row.link == null ? null : normalizeText(row.link) || null;
        const source = row.source == null ? null : normalizeText(row.source) || null;
        const publishedAt = row.publishedAt ? toIsoString(row.publishedAt, new Date().toISOString()) : null;
        const itemHash = normalizeText(row.itemHash) || hashToken(`${provider}::${symbol}::${title}::${link || ""}::${publishedAt || ""}`).slice(0, 20);
        const eventHash = normalizeText(row.eventHash) || hashToken(`${provider}::${symbol}::${itemHash}`).slice(0, 20);
        const scorePct = clampNumber(toFiniteNumber(row.scorePct, 50), 0, 100);
        const confidencePct = clampNumber(toFiniteNumber(row.confidencePct, 0), 0, 100);
        const llmSummary = row.llmSummary == null ? null : normalizeText(row.llmSummary) || null;
        const llmDriversJson = row.llmDrivers ? JSON.stringify(row.llmDrivers) : null;
        const llmMajorEventJson = row.llmMajorEvent ? JSON.stringify(row.llmMajorEvent) : null;
        const llmActionHint = row.llmActionHint == null ? null : normalizeText(row.llmActionHint) || null;
        const analyzedAt = toIsoString(row.analyzedAt, new Date().toISOString());
        await query(
          `INSERT INTO daa_news_event_snapshot_v1
            (provider, symbol, event_hash, item_hash, title, link, source, published_at,
             score_pct, confidence_pct, llm_summary, llm_drivers_json, llm_major_event_json, llm_action_hint,
             analyzed_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,NOW())
           ON CONFLICT (provider, symbol, event_hash)
           DO UPDATE SET
             item_hash = EXCLUDED.item_hash,
             title = EXCLUDED.title,
             link = EXCLUDED.link,
             source = EXCLUDED.source,
             published_at = EXCLUDED.published_at,
             score_pct = EXCLUDED.score_pct,
             confidence_pct = EXCLUDED.confidence_pct,
             llm_summary = EXCLUDED.llm_summary,
             llm_drivers_json = EXCLUDED.llm_drivers_json,
             llm_major_event_json = EXCLUDED.llm_major_event_json,
             llm_action_hint = EXCLUDED.llm_action_hint,
             analyzed_at = EXCLUDED.analyzed_at,
             updated_at = NOW()`,
          [
            provider,
            symbol,
            eventHash,
            itemHash,
            title,
            link,
            source,
            publishedAt,
            scorePct,
            confidencePct,
            llmSummary,
            llmDriversJson,
            llmMajorEventJson,
            llmActionHint,
            analyzedAt,
          ],
        );
        touched += 1;
      }
    });
    return touched;
  });
}

export async function listDaaNewsEventsBySymbol(input: {
  provider?: string;
  symbol: string;
  limit?: number;
}): Promise<DaaStoreNewsEventSnapshot[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const symbol = normalizeUpper(input.symbol);
    if (!symbol) return [];
    const provider = input.provider == null ? "" : normalizeText(input.provider);
    const limit = Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(input.limit, 20))));
    const where = ["symbol = $1"];
    const params: unknown[] = [symbol];
    if (provider) {
      params.push(provider);
      where.push(`provider = $${params.length}`);
    }
    params.push(limit);
    const result = await query(
      `SELECT ${NEWS_EVENT_SNAPSHOT_SELECT_COLUMNS_}
       FROM daa_news_event_snapshot_v1
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(published_at, analyzed_at) DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapNewsEventSnapshotRow(row as Record<string, unknown>));
  });
}

export async function upsertDaaNewsEventGraphs(rows: Array<Partial<DaaStoreNewsEventGraph>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "multi");
        const symbol = normalizeUpper(row.symbol);
        const itemHash = normalizeText(row.itemHash);
        const eventHash = normalizeText(row.eventHash) || hashToken(`${provider}::${symbol}::${itemHash || row.themeKey || "event"}`).slice(0, 20);
        const themeKey = normalizeText(row.themeKey, "general").toLowerCase();
        if (!symbol || !eventHash || !themeKey) continue;
        const themeLabelZh = normalizeText(row.themeLabelZh, "综合事件");
        const relatedAssets = normalizeNewsRelatedAssets(row.relatedAssets ?? []);
        const eventScorePct = clampNumber(toFiniteNumber(row.eventScorePct, 50), 0, 100);
        const reasons = normalizeStringArray(row.reasons ?? []);
        const generatedAt = toIsoString(row.generatedAt, new Date().toISOString());
        await query(
          `INSERT INTO daa_news_event_graph_v1
            (provider, symbol, event_hash, item_hash, theme_key, theme_label_zh,
             related_assets_json, event_score_pct, reasons_json, generated_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,NOW())
           ON CONFLICT (provider, symbol, event_hash, theme_key)
           DO UPDATE SET
             item_hash = EXCLUDED.item_hash,
             theme_label_zh = EXCLUDED.theme_label_zh,
             related_assets_json = EXCLUDED.related_assets_json,
             event_score_pct = EXCLUDED.event_score_pct,
             reasons_json = EXCLUDED.reasons_json,
             generated_at = EXCLUDED.generated_at,
             updated_at = NOW()`,
          [
            provider,
            symbol,
            eventHash,
            itemHash,
            themeKey,
            themeLabelZh,
            JSON.stringify(relatedAssets),
            eventScorePct,
            JSON.stringify(reasons),
            generatedAt,
          ],
        );
        const relatedAssetKeys = relatedAssets.map((asset) => asset.assetKey.toUpperCase());
        await query(
          `DELETE FROM daa_news_event_related_asset_v1
           WHERE provider = $1
             AND symbol = $2
             AND event_hash = $3
             AND theme_key = $4
             AND NOT (related_asset_key = ANY($5::text[]))`,
          [provider, symbol, eventHash, themeKey, relatedAssetKeys],
        );
        for (const related of relatedAssets) {
          const relatedAssetKey = related.assetKey.toUpperCase();
          if (!relatedAssetKey || !related.symbol) continue;
          await query(
            `INSERT INTO daa_news_event_related_asset_v1
              (provider, symbol, event_hash, theme_key, related_asset_key, related_symbol,
               related_market, relation, confidence_pct, reason_zh, generated_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
             ON CONFLICT (provider, symbol, event_hash, theme_key, related_asset_key)
             DO UPDATE SET
               related_symbol = EXCLUDED.related_symbol,
               related_market = EXCLUDED.related_market,
               relation = EXCLUDED.relation,
               confidence_pct = EXCLUDED.confidence_pct,
               reason_zh = EXCLUDED.reason_zh,
               generated_at = EXCLUDED.generated_at,
               updated_at = NOW()`,
            [
              provider,
              symbol,
              eventHash,
              themeKey,
              relatedAssetKey,
              normalizeUpper(related.symbol),
              normalizeUpper(related.market, "US"),
              normalizeNewsRelatedAssetRelation(related.relation),
              clampNumber(toFiniteNumber(related.confidencePct, 50), 0, 100),
              normalizeText(related.reasonZh, "同一事件主题下的关联资产"),
              generatedAt,
            ],
          );
        }
        touched += 1;
      }
    });
    return touched;
  });
}

export async function listLatestDaaNewsEventGraphs(input: {
  provider?: string;
  symbols?: string[];
  eventHashes?: string[];
  themeKeys?: string[];
  limit?: number;
} = {}): Promise<DaaStoreNewsEventGraph[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.provider) {
      params.push(normalizeText(input.provider));
      where.push(`provider = $${params.length}`);
    }
    const symbols = Array.isArray(input.symbols)
      ? [...new Set(input.symbols.map((item) => normalizeUpper(item)).filter(Boolean))]
      : [];
    if (symbols.length > 0) {
      params.push(symbols);
      where.push(`symbol = ANY($${params.length})`);
    }
    const eventHashes = Array.isArray(input.eventHashes)
      ? [...new Set(input.eventHashes.map((item) => normalizeText(item)).filter(Boolean))]
      : [];
    if (eventHashes.length > 0) {
      params.push(eventHashes);
      where.push(`event_hash = ANY($${params.length})`);
    }
    const themeKeys = Array.isArray(input.themeKeys)
      ? [...new Set(input.themeKeys.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))]
      : [];
    if (themeKeys.length > 0) {
      params.push(themeKeys);
      where.push(`theme_key = ANY($${params.length})`);
    }
    const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(input.limit, 80))));
    params.push(limit);
    const result = await query(
      `SELECT ${NEWS_EVENT_GRAPH_SELECT_COLUMNS_}
       FROM daa_news_event_graph_v1
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY generated_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapNewsEventGraphRow(row as Record<string, unknown>));
  });
}

export async function listLatestDaaNewsEventRelatedAssets(input: {
  provider?: string;
  symbols?: string[];
  eventHashes?: string[];
  themeKeys?: string[];
  relatedAssetKeys?: string[];
  limit?: number;
} = {}): Promise<DaaStoreNewsEventRelatedAssetEdge[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.provider) {
      params.push(normalizeText(input.provider));
      where.push(`provider = $${params.length}`);
    }
    const symbols = Array.isArray(input.symbols)
      ? [...new Set(input.symbols.map((item) => normalizeUpper(item)).filter(Boolean))]
      : [];
    if (symbols.length > 0) {
      params.push(symbols);
      where.push(`symbol = ANY($${params.length})`);
    }
    const eventHashes = Array.isArray(input.eventHashes)
      ? [...new Set(input.eventHashes.map((item) => normalizeText(item)).filter(Boolean))]
      : [];
    if (eventHashes.length > 0) {
      params.push(eventHashes);
      where.push(`event_hash = ANY($${params.length})`);
    }
    const themeKeys = Array.isArray(input.themeKeys)
      ? [...new Set(input.themeKeys.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))]
      : [];
    if (themeKeys.length > 0) {
      params.push(themeKeys);
      where.push(`theme_key = ANY($${params.length})`);
    }
    const relatedAssetKeys = Array.isArray(input.relatedAssetKeys)
      ? [...new Set(input.relatedAssetKeys.map((item) => normalizeText(item).toUpperCase()).filter(Boolean))]
      : [];
    if (relatedAssetKeys.length > 0) {
      params.push(relatedAssetKeys);
      where.push(`related_asset_key = ANY($${params.length})`);
    }
    const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(input.limit, 80))));
    params.push(limit);
    const result = await query(
      `SELECT ${NEWS_EVENT_RELATED_ASSET_SELECT_COLUMNS_}
       FROM daa_news_event_related_asset_v1
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY generated_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapNewsEventRelatedAssetEdgeRow(row as Record<string, unknown>));
  });
}

export async function upsertDaaNewsPortfolioImpacts(rows: Array<Partial<DaaStoreNewsPortfolioImpact>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const ownerAccountId = normalizeText(row.ownerAccountId, getDaaAccountScopeId());
        const provider = normalizeText(row.provider, "multi");
        const symbol = normalizeUpper(row.symbol);
        const eventHash = normalizeText(row.eventHash);
        const assetKey = normalizeText(row.assetKey).toUpperCase();
        if (!ownerAccountId || !symbol || !eventHash || !assetKey) continue;
        const id = normalizeText(row.id) || hashToken(`${ownerAccountId}::${provider}::${symbol}::${eventHash}::${assetKey}`);
        const impactScope = normalizeNewsImpactScope(row.impactScope);
        const impactLevel = normalizeNewsImpactLevel(row.impactLevel);
        const impactScorePct = clampNumber(toFiniteNumber(row.impactScorePct, 0), 0, 100);
        const recommendedAction = normalizeNewsRecommendedAction(row.recommendedAction);
        const reasonZh = normalizeText(row.reasonZh, "新闻事件可能影响该资产");
        const generatedAt = toIsoString(row.generatedAt, new Date().toISOString());
        await query(
          `INSERT INTO daa_news_portfolio_impact_v1
            (id, owner_account_id, provider, symbol, event_hash, asset_key,
             impact_scope, impact_level, impact_score_pct, recommended_action, reason_zh, generated_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
           ON CONFLICT (owner_account_id, provider, symbol, event_hash, asset_key)
           DO UPDATE SET
             impact_scope = EXCLUDED.impact_scope,
             impact_level = EXCLUDED.impact_level,
             impact_score_pct = EXCLUDED.impact_score_pct,
             recommended_action = EXCLUDED.recommended_action,
             reason_zh = EXCLUDED.reason_zh,
             generated_at = EXCLUDED.generated_at,
             updated_at = NOW()`,
          [
            id,
            ownerAccountId,
            provider,
            symbol,
            eventHash,
            assetKey,
            impactScope,
            impactLevel,
            impactScorePct,
            recommendedAction,
            reasonZh,
            generatedAt,
          ],
        );
        touched += 1;
      }
    });
    return touched;
  });
}

export async function listLatestDaaNewsPortfolioImpacts(input: {
  ownerAccountId?: string;
  provider?: string;
  symbols?: string[];
  assetKeys?: string[];
  eventHashes?: string[];
  impactScopes?: DaaStoreNewsImpactScope[];
  impactLevels?: DaaStoreNewsImpactLevel[];
  limit?: number;
} = {}): Promise<DaaStoreNewsPortfolioImpact[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const where: string[] = [];
    const params: unknown[] = [];
    params.push(normalizeText(input.ownerAccountId, getDaaAccountScopeId()));
    where.push(`owner_account_id = $${params.length}`);
    if (input.provider) {
      params.push(normalizeText(input.provider));
      where.push(`provider = $${params.length}`);
    }
    const symbols = Array.isArray(input.symbols)
      ? [...new Set(input.symbols.map((item) => normalizeUpper(item)).filter(Boolean))]
      : [];
    if (symbols.length > 0) {
      params.push(symbols);
      where.push(`symbol = ANY($${params.length})`);
    }
    const assetKeys = Array.isArray(input.assetKeys)
      ? [...new Set(input.assetKeys.map((item) => normalizeText(item).toUpperCase()).filter(Boolean))]
      : [];
    if (assetKeys.length > 0) {
      params.push(assetKeys);
      where.push(`asset_key = ANY($${params.length})`);
    }
    const eventHashes = Array.isArray(input.eventHashes)
      ? [...new Set(input.eventHashes.map((item) => normalizeText(item)).filter(Boolean))]
      : [];
    if (eventHashes.length > 0) {
      params.push(eventHashes);
      where.push(`event_hash = ANY($${params.length})`);
    }
    const impactScopes = Array.isArray(input.impactScopes)
      ? [...new Set(input.impactScopes.map((item) => normalizeNewsImpactScope(item)).filter(Boolean))]
      : [];
    if (impactScopes.length > 0) {
      params.push(impactScopes);
      where.push(`impact_scope = ANY($${params.length})`);
    }
    const impactLevels = Array.isArray(input.impactLevels)
      ? [...new Set(input.impactLevels.map((item) => normalizeNewsImpactLevel(item)).filter(Boolean))]
      : [];
    if (impactLevels.length > 0) {
      params.push(impactLevels);
      where.push(`impact_level = ANY($${params.length})`);
    }
    const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(input.limit, 80))));
    params.push(limit);
    const result = await query(
      `SELECT ${NEWS_PORTFOLIO_IMPACT_SELECT_COLUMNS_}
       FROM daa_news_portfolio_impact_v1
       WHERE ${where.join(" AND ")}
       ORDER BY generated_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapNewsPortfolioImpactRow(row as Record<string, unknown>));
  });
}

export async function upsertDaaDiscoveryCandidates(rows: Array<Partial<DaaStoreDiscoveryCandidate>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let touched = 0;
    await withPgTransaction(query, async () => {
      for (const row of rows) {
        const ownerAccountId = normalizeText(row.ownerAccountId, getDaaAccountScopeId());
        const topicKey = normalizeText(row.topicKey, "general").toLowerCase();
        const assetKey = normalizeText(row.assetKey).toUpperCase();
        const symbol = normalizeUpper(row.symbol);
        const market = normalizeUpper(row.market, "US");
        if (!ownerAccountId || !topicKey || !assetKey || !symbol) continue;
        const id = normalizeText(row.id) || hashToken(`${ownerAccountId}::${topicKey}::${assetKey}`);
        const topicLabelZh = normalizeText(row.topicLabelZh, "综合主题");
        const name = row.name == null ? null : normalizeText(row.name) || null;
        const displayNameZh = row.displayNameZh == null ? null : normalizeText(row.displayNameZh) || null;
        const scorePct = clampNumber(toFiniteNumber(row.scorePct, 0), 0, 100);
        const confidence = normalizeDiscoveryCandidateConfidence(row.confidence);
        const status = normalizeDiscoveryCandidateStatus(row.status);
        // 新闻雷达生成的新候选不应把用户已经 dismissed / archived 的候选重新激活。
        const statusProvided = row.status != null && status !== "new";
        const reasonZh = normalizeText(row.reasonZh, "新闻主题触发的候选研究资产");
          const riskNotesZh = normalizeStringArray(row.riskNotesZh ?? []);
          const evidenceRefs = normalizeStringArray(row.evidenceRefs ?? []);
          const discoveredAt = toIsoString(row.discoveredAt, new Date().toISOString());
          const lastSeenAt = toIsoString(row.lastSeenAt, discoveredAt);
          const seenCount = Math.max(1, Math.trunc(toFiniteNumber(row.seenCount, 1)));
          const statusTransitionAt = toIsoString(row.statusUpdatedAt, new Date().toISOString());
          const reviewedAt = row.reviewedAt == null
            ? (statusProvided ? statusTransitionAt : null)
            : toIsoString(row.reviewedAt);
          const promotedAt = row.promotedAt == null
            ? (statusProvided && status === "watching" ? statusTransitionAt : null)
            : toIsoString(row.promotedAt);
          const dismissedAt = row.dismissedAt == null
            ? (statusProvided && status === "dismissed" ? statusTransitionAt : null)
            : toIsoString(row.dismissedAt);
          const archivedAt = row.archivedAt == null
            ? (statusProvided && status === "archived" ? statusTransitionAt : null)
            : toIsoString(row.archivedAt);
          await query(
            `INSERT INTO daa_discovery_candidates_v1
              (id, owner_account_id, topic_key, topic_label_zh, asset_key, symbol, market, name, display_name_zh,
               score_pct, confidence, status, reason_zh, risk_notes_json, evidence_refs_json, discovered_at,
               last_seen_at, seen_count, reviewed_at, promoted_at, dismissed_at, archived_at, status_updated_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
             ON CONFLICT (owner_account_id, topic_key, asset_key)
             DO UPDATE SET
               topic_label_zh = EXCLUDED.topic_label_zh,
             symbol = EXCLUDED.symbol,
             market = EXCLUDED.market,
             name = EXCLUDED.name,
               display_name_zh = EXCLUDED.display_name_zh,
               score_pct = GREATEST(daa_discovery_candidates_v1.score_pct, EXCLUDED.score_pct),
               confidence = EXCLUDED.confidence,
               status = CASE WHEN $24::boolean THEN EXCLUDED.status ELSE daa_discovery_candidates_v1.status END,
               reason_zh = EXCLUDED.reason_zh,
               risk_notes_json = COALESCE(
                 (SELECT jsonb_agg(DISTINCT value)
                  FROM jsonb_array_elements_text(daa_discovery_candidates_v1.risk_notes_json || EXCLUDED.risk_notes_json) AS merged(value)),
                 '[]'::jsonb
               ),
               evidence_refs_json = COALESCE(
                 (SELECT jsonb_agg(DISTINCT value)
                  FROM jsonb_array_elements_text(daa_discovery_candidates_v1.evidence_refs_json || EXCLUDED.evidence_refs_json) AS merged(value)),
                 '[]'::jsonb
               ),
               last_seen_at = GREATEST(daa_discovery_candidates_v1.last_seen_at, EXCLUDED.last_seen_at),
               seen_count = GREATEST(1, daa_discovery_candidates_v1.seen_count) + GREATEST(1, EXCLUDED.seen_count),
               reviewed_at = CASE WHEN $24::boolean THEN COALESCE(EXCLUDED.reviewed_at, daa_discovery_candidates_v1.reviewed_at, NOW()) ELSE daa_discovery_candidates_v1.reviewed_at END,
               promoted_at = CASE WHEN $24::boolean AND EXCLUDED.status = 'watching' THEN COALESCE(EXCLUDED.promoted_at, daa_discovery_candidates_v1.promoted_at, NOW()) ELSE daa_discovery_candidates_v1.promoted_at END,
               dismissed_at = CASE WHEN $24::boolean AND EXCLUDED.status = 'dismissed' THEN COALESCE(EXCLUDED.dismissed_at, daa_discovery_candidates_v1.dismissed_at, NOW()) ELSE daa_discovery_candidates_v1.dismissed_at END,
               archived_at = CASE WHEN $24::boolean AND EXCLUDED.status = 'archived' THEN COALESCE(EXCLUDED.archived_at, daa_discovery_candidates_v1.archived_at, NOW()) ELSE daa_discovery_candidates_v1.archived_at END,
               status_updated_at = CASE WHEN $24::boolean AND EXCLUDED.status <> daa_discovery_candidates_v1.status THEN EXCLUDED.status_updated_at ELSE daa_discovery_candidates_v1.status_updated_at END,
               updated_at = NOW()`,
          [
            id,
            ownerAccountId,
            topicKey,
            topicLabelZh,
            assetKey,
            symbol,
            market,
            name,
            displayNameZh,
            scorePct,
            confidence,
            status,
            reasonZh,
            JSON.stringify(riskNotesZh),
              JSON.stringify(evidenceRefs),
              discoveredAt,
              lastSeenAt,
              seenCount,
              reviewedAt,
              promotedAt,
              dismissedAt,
              archivedAt,
              statusTransitionAt,
              statusProvided,
            ],
          );
        touched += 1;
      }
    });
    return touched;
  });
}

export async function listDaaDiscoveryCandidates(input: {
  ownerAccountId?: string;
  topicKeys?: string[];
  assetKeys?: string[];
  statuses?: DaaStoreDiscoveryCandidateStatus[];
  limit?: number;
} = {}): Promise<DaaStoreDiscoveryCandidate[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const where: string[] = [];
    const params: unknown[] = [];
    params.push(normalizeText(input.ownerAccountId, getDaaAccountScopeId()));
    where.push(`owner_account_id = $${params.length}`);
    const topicKeys = Array.isArray(input.topicKeys)
      ? [...new Set(input.topicKeys.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))]
      : [];
    if (topicKeys.length > 0) {
      params.push(topicKeys);
      where.push(`topic_key = ANY($${params.length})`);
    }
    const assetKeys = Array.isArray(input.assetKeys)
      ? [...new Set(input.assetKeys.map((item) => normalizeText(item).toUpperCase()).filter(Boolean))]
      : [];
    if (assetKeys.length > 0) {
      params.push(assetKeys);
      where.push(`asset_key = ANY($${params.length})`);
    }
    const statuses = Array.isArray(input.statuses)
      ? [...new Set(input.statuses.map((item) => normalizeDiscoveryCandidateStatus(item)).filter(Boolean))]
      : [];
    if (statuses.length > 0) {
      params.push(statuses);
      where.push(`status = ANY($${params.length})`);
    }
    const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(input.limit, 80))));
    params.push(limit);
    const result = await query(
      `SELECT ${DISCOVERY_CANDIDATE_SELECT_COLUMNS_}
       FROM daa_discovery_candidates_v1
       WHERE ${where.join(" AND ")}
       ORDER BY score_pct DESC, updated_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapDiscoveryCandidateRow(row as Record<string, unknown>));
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
    const result = await query(
      `SELECT DISTINCT ON (indicator_key) ${MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_}
       FROM daa_market_indicator_snapshot_v1
       WHERE indicator_key = ANY($1::text[])
       ORDER BY indicator_key, generated_at DESC`,
      [MARKET_INDICATOR_KEYS_],
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
