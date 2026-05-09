/**
 * Job and external-payload store functions.
 */

import { randomUUID } from "node:crypto";
import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { withDaaPgClient, parseJsonb, toIsoString } from "./storeShared";
import type { DaaStoreExternalPayloadRaw } from "./storeTypes";
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
