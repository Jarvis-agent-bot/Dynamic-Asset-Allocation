/**
 * Job and external-payload store functions.
 */

import { randomUUID } from "node:crypto";
import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { withDaaPgClient, parseJsonb, toIsoString } from "./storeShared";
import type {
  DaaExternalRequestLogSummaryItem,
  DaaStoreExternalPayloadRaw,
  DaaStoreExternalRequestLog,
} from "./storeTypes";
import { ensureDaaMarketCacheSchemaPg } from "./storeSchema";

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

const EXTERNAL_REQUEST_LOG_SELECT_COLUMNS_ = [
  "id",
  "provider",
  "resource",
  "subject_key",
  "endpoint_host",
  "http_status",
  "error_code",
  "error_message",
  "latency_ms",
  "retry_count",
  "cache_status",
  "caller",
  "raw_ref_id",
  "created_at",
].join(", ");

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

function mapExternalRequestLogRow(row: Record<string, unknown>): DaaStoreExternalRequestLog {
  return {
    id: normalizeText(row.id),
    provider: normalizeText(row.provider),
    resource: normalizeText(row.resource),
    subjectKey: normalizeText(row.subject_key),
    endpointHost: normalizeText(row.endpoint_host),
    httpStatus: Math.max(0, Math.trunc(toFiniteNumber(row.http_status, 0))),
    errorCode: normalizeText(row.error_code),
    errorMessage: normalizeText(row.error_message),
    latencyMs: Math.max(0, Math.trunc(toFiniteNumber(row.latency_ms, 0))),
    retryCount: Math.max(0, Math.trunc(toFiniteNumber(row.retry_count, 0))),
    cacheStatus: normalizeText(row.cache_status),
    caller: normalizeText(row.caller),
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id),
    createdAt: toIsoString(row.created_at, new Date().toISOString()),
  };
}

function mapExternalRequestLogSummaryRow(row: Record<string, unknown>): DaaExternalRequestLogSummaryItem {
  return {
    provider: normalizeText(row.provider),
    resource: normalizeText(row.resource),
    endpointHost: normalizeText(row.endpoint_host),
    totalCount: Math.max(0, Math.trunc(toFiniteNumber(row.total_count, 0))),
    successCount: Math.max(0, Math.trunc(toFiniteNumber(row.success_count, 0))),
    errorCount: Math.max(0, Math.trunc(toFiniteNumber(row.error_count, 0))),
    rateLimitedCount: Math.max(0, Math.trunc(toFiniteNumber(row.rate_limited_count, 0))),
    unauthorizedCount: Math.max(0, Math.trunc(toFiniteNumber(row.unauthorized_count, 0))),
    latestAt: row.latest_at == null ? null : toIsoString(row.latest_at, new Date().toISOString()),
    latestStatus: Math.max(0, Math.trunc(toFiniteNumber(row.latest_status, 0))),
    latestErrorCode: normalizeText(row.latest_error_code),
  };
}

export async function appendDaaExternalRequestLog(input: {
  provider: string;
  resource: string;
  subjectKey?: string;
  endpointHost?: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
  retryCount?: number;
  cacheStatus?: string;
  caller?: string;
  rawRefId?: string | null;
  createdAt?: string;
}): Promise<DaaStoreExternalRequestLog> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const provider = normalizeText(input.provider, "unknown");
    const resource = normalizeText(input.resource, "unknown");
    const subjectKey = normalizeText(input.subjectKey, "");
    const endpointHost = normalizeText(input.endpointHost, "");
    const httpStatus = Math.max(0, Math.trunc(toFiniteNumber(input.httpStatus, 0)));
    const errorCode = normalizeText(input.errorCode, "");
    const errorMessage = normalizeText(input.errorMessage, "").slice(0, 2000);
    const latencyMs = Math.max(0, Math.trunc(toFiniteNumber(input.latencyMs, 0)));
    const retryCount = Math.max(0, Math.trunc(toFiniteNumber(input.retryCount, 0)));
    const cacheStatus = normalizeText(input.cacheStatus, "");
    const caller = normalizeText(input.caller, "");
    const rawRefId = input.rawRefId == null ? null : normalizeText(input.rawRefId, "");
    const createdAt = toIsoString(input.createdAt, new Date().toISOString());

    await query(
      `INSERT INTO daa_external_request_log_v1
        (id, provider, resource, subject_key, endpoint_host, http_status, error_code, error_message, latency_ms, retry_count, cache_status, caller, raw_ref_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, provider, resource, subjectKey, endpointHost, httpStatus, errorCode, errorMessage, latencyMs, retryCount, cacheStatus, caller, rawRefId, createdAt],
    );
    const res = await query(
      `SELECT ${EXTERNAL_REQUEST_LOG_SELECT_COLUMNS_} FROM daa_external_request_log_v1 WHERE id = $1 LIMIT 1`,
      [id],
    );
    return mapExternalRequestLogRow(res.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaExternalRequestLogs(input: {
  provider?: string;
  limit?: number;
  sinceHours?: number;
} = {}): Promise<{
  items: DaaStoreExternalRequestLog[];
  summary: DaaExternalRequestLogSummaryItem[];
}> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const provider = normalizeText(input.provider, "");
    const limit = Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(input.limit, 50))));
    const sinceHours = Math.max(1, Math.min(720, Math.trunc(toFiniteNumber(input.sinceHours, 24))));
    const params: unknown[] = [sinceHours];
    const providerClause = provider ? `AND provider = $${params.push(provider)}` : "";
    const itemParams = [...params, limit];
    const itemsRes = await query(
      `SELECT ${EXTERNAL_REQUEST_LOG_SELECT_COLUMNS_}
       FROM daa_external_request_log_v1
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 hour')
         ${providerClause}
       ORDER BY created_at DESC
       LIMIT $${itemParams.length}`,
      itemParams,
    );
    const summaryRes = await query(
      `WITH scoped AS (
         SELECT *
         FROM daa_external_request_log_v1
         WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 hour')
           ${providerClause}
       ),
       latest AS (
         SELECT DISTINCT ON (provider, resource, endpoint_host)
           provider, resource, endpoint_host, http_status AS latest_status, error_code AS latest_error_code, created_at AS latest_at
         FROM scoped
         ORDER BY provider, resource, endpoint_host, created_at DESC
       )
       SELECT
         s.provider,
         s.resource,
         s.endpoint_host,
         COUNT(*)::INT AS total_count,
         SUM(CASE WHEN s.http_status >= 200 AND s.http_status < 300 AND s.error_code = '' THEN 1 ELSE 0 END)::INT AS success_count,
         SUM(CASE WHEN s.http_status < 200 OR s.http_status >= 300 OR s.error_code <> '' THEN 1 ELSE 0 END)::INT AS error_count,
         SUM(CASE WHEN s.http_status = 429 OR s.error_code = 'rate_limited' THEN 1 ELSE 0 END)::INT AS rate_limited_count,
         SUM(CASE WHEN s.http_status IN (401,403) OR s.error_code IN ('invalid_crumb','unauthorized','region_blocked') THEN 1 ELSE 0 END)::INT AS unauthorized_count,
         l.latest_at,
         l.latest_status,
         l.latest_error_code
       FROM scoped s
       JOIN latest l
         ON l.provider = s.provider
        AND l.resource = s.resource
        AND l.endpoint_host = s.endpoint_host
       GROUP BY s.provider, s.resource, s.endpoint_host, l.latest_at, l.latest_status, l.latest_error_code
       ORDER BY l.latest_at DESC`,
      params,
    );
    return {
      items: itemsRes.rows.map((row) => mapExternalRequestLogRow(row as Record<string, unknown>)),
      summary: summaryRes.rows.map((row) => mapExternalRequestLogSummaryRow(row as Record<string, unknown>)),
    };
  });
}

export async function appendDaaExternalPayloadRaw(input: {
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

export async function getLatestDaaExternalPayloadRaw(input: {
  provider: string;
  resource: string;
  subjectKey?: string;
  freshOnly?: boolean;
  nowIso?: string;
}): Promise<DaaStoreExternalPayloadRaw | null> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const provider = normalizeText(input.provider, "unknown");
    const resource = normalizeText(input.resource, "unknown");
    const subjectKey = normalizeText(input.subjectKey, "");
    const params: unknown[] = [provider, resource, subjectKey];
    const freshClause = input.freshOnly
      ? `AND expire_at > $${params.push(toIsoString(input.nowIso, new Date().toISOString()))}`
      : "";
    const result = await query(
      `SELECT ${RAW_PAYLOAD_SELECT_COLUMNS_}
       FROM daa_external_payload_raw_v1
       WHERE provider = $1 AND resource = $2 AND subject_key = $3
         ${freshClause}
       ORDER BY fetched_at DESC
       LIMIT 1`,
      params,
    );
    if (result.rows.length === 0) return null;
    return mapExternalPayloadRawRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function deleteExpiredDaaExternalPayloadRaw(nowIso = new Date().toISOString()): Promise<number> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "DELETE FROM daa_external_payload_raw_v1 WHERE expire_at <= $1",
      [toIsoString(nowIso, new Date().toISOString())],
    );
    return Math.max(0, Math.trunc(toFiniteNumber(result.rowCount, 0)));
  });
}

export async function deleteOldDaaExternalRequestLogs(input: {
  retentionDays?: number;
  nowIso?: string;
} = {}): Promise<number> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const retentionDays = Math.max(1, Math.min(365, Math.trunc(toFiniteNumber(input.retentionDays, 90))));
    const nowIso = toIsoString(input.nowIso, new Date().toISOString());
    const result = await query(
      "DELETE FROM daa_external_request_log_v1 WHERE created_at < ($1::timestamptz - ($2::INT * INTERVAL '1 day'))",
      [nowIso, retentionDays],
    );
    return Math.max(0, Math.trunc(toFiniteNumber(result.rowCount, 0)));
  });
}

export async function getDaaMarketCacheHealthStats(provider = "yfinance"): Promise<{
  provider: string;
  totalSnapshots: number;
  freshCount: number;
  staleCount: number;
  missingCount: number;
  errorCount: number;
  unsupportedCount: number;
  recentJobSuccessRatePct: number;
  recentJobFailureRatePct: number;
}> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const providerNormalized = normalizeText(provider, "yfinance");
    const summaryRes = await query(
      `SELECT
         COUNT(*)::INT AS total_count,
         SUM(CASE WHEN status='fresh' THEN 1 ELSE 0 END)::INT AS fresh_count,
         SUM(CASE WHEN status='stale' THEN 1 ELSE 0 END)::INT AS stale_count,
         SUM(CASE WHEN status='missing' THEN 1 ELSE 0 END)::INT AS missing_count,
         SUM(CASE WHEN status='error' THEN 1 ELSE 0 END)::INT AS error_count,
         SUM(CASE WHEN status='unsupported' THEN 1 ELSE 0 END)::INT AS unsupported_count
       FROM daa_market_price_snapshot
       WHERE provider = $1`,
      [providerNormalized],
    );
    const summary = summaryRes.rows[0] as Record<string, unknown> | undefined;

    const jobsRes = await query(
      `SELECT
         COUNT(*)::INT AS total_count,
         SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END)::INT AS success_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::INT AS failure_count
       FROM daa_job_execution_logs
       WHERE job_type IN ('market_cache_refresh', 'cron_price_refresh')
         AND started_at >= NOW() - INTERVAL '24 hours'`,
      [],
    );
    const jobs = jobsRes.rows[0] as Record<string, unknown> | undefined;
    const successCount = Math.max(0, Math.trunc(toFiniteNumber(jobs?.success_count, 0)));
    const failureCount = Math.max(0, Math.trunc(toFiniteNumber(jobs?.failure_count, 0)));
    const totalCount = Math.max(0, Math.trunc(toFiniteNumber(jobs?.total_count, successCount + failureCount)));
    const safeDenominator = totalCount > 0 ? totalCount : Math.max(1, successCount + failureCount);
    const successRate = safeDenominator > 0 ? (successCount / safeDenominator) * 100 : 100;
    const failureRate = safeDenominator > 0 ? (failureCount / safeDenominator) * 100 : 0;

    return {
      provider: providerNormalized,
      totalSnapshots: Math.max(0, Math.trunc(toFiniteNumber(summary?.total_count, 0))),
      freshCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.fresh_count, 0))),
      staleCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.stale_count, 0))),
      missingCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.missing_count, 0))),
      errorCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.error_count, 0))),
      unsupportedCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.unsupported_count, 0))),
      recentJobSuccessRatePct: Number(successRate.toFixed(2)),
      recentJobFailureRatePct: Number(failureRate.toFixed(2)),
    };
  });
}
