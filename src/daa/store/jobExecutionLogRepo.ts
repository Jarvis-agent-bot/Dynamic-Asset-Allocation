import { randomUUID } from "node:crypto";

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { ensureDaaStoreSchemaPg } from "@/src/daa/store/daaStorePg";
import { toIsoString, toNullableNumber, parseJsonb } from "@/src/daa/store/storeShared";
import { normalizeText } from "@/src/daa/utils/normalize";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";

export type DaaJobExecutionLog = {
  jobId: string;
  ownerAccountId: string;
  jobType: string;
  requestId: string | null;
  triggerSource: string;
  idempotencyKey: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultJson: Record<string, unknown> | null;
  errorText: string | null;
  createdAt: string;
};

function mapJobLogRow(row: Record<string, unknown>): DaaJobExecutionLog {
  return {
    jobId: normalizeText(row.job_id),
    ownerAccountId: normalizeText(row.owner_account_id, "default"),
    jobType: normalizeText(row.job_type),
    requestId: row.request_id == null ? null : normalizeText(row.request_id) || null,
    triggerSource: normalizeText(row.trigger_source),
    idempotencyKey: row.idempotency_key == null ? null : normalizeText(row.idempotency_key) || null,
    status: normalizeText(row.status),
    startedAt: toIsoString(row.started_at),
    finishedAt: row.finished_at == null ? null : toIsoString(row.finished_at),
    durationMs: toNullableNumber(row.duration_ms),
    resultJson: parseJsonb<Record<string, unknown> | null>(row.result_json, null),
    errorText: row.error_text == null ? null : normalizeText(row.error_text) || null,
    createdAt: toIsoString(row.created_at),
  };
}

export async function appendJobExecutionLog(input: {
  jobId?: string;
  jobType: string;
  requestId?: string | null;
  triggerSource: string;
  idempotencyKey?: string | null;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  resultJson?: Record<string, unknown> | null;
  errorText?: string | null;
}): Promise<DaaJobExecutionLog> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const jobId = normalizeText(input.jobId) || randomUUID();
    const result = await query(
      `INSERT INTO daa_job_execution_logs (
        owner_account_id, job_id, job_type, request_id, trigger_source, idempotency_key, status,
        started_at, finished_at, duration_ms, result_json, error_text
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11::jsonb, $12
      )
      ON CONFLICT (job_id) DO UPDATE
      SET owner_account_id = EXCLUDED.owner_account_id,
          job_type = EXCLUDED.job_type,
          request_id = EXCLUDED.request_id,
          trigger_source = EXCLUDED.trigger_source,
          idempotency_key = EXCLUDED.idempotency_key,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          finished_at = EXCLUDED.finished_at,
          duration_ms = EXCLUDED.duration_ms,
          result_json = EXCLUDED.result_json,
          error_text = EXCLUDED.error_text
      RETURNING owner_account_id, job_id, job_type, request_id, trigger_source, idempotency_key, status, started_at, finished_at, duration_ms, result_json, error_text, created_at`,
      [
        ownerAccountId,
        jobId,
        normalizeText(input.jobType),
        input.requestId ? normalizeText(input.requestId) : null,
        normalizeText(input.triggerSource),
        input.idempotencyKey ? normalizeText(input.idempotencyKey) : null,
        normalizeText(input.status),
        toIsoString(input.startedAt, new Date().toISOString()),
        input.finishedAt ? toIsoString(input.finishedAt) : null,
        input.durationMs == null ? null : Math.max(0, Math.trunc(Number(input.durationMs) || 0)),
        JSON.stringify(input.resultJson && typeof input.resultJson === "object" ? input.resultJson : null),
        input.errorText ? normalizeText(input.errorText) : null,
      ],
    );
    return mapJobLogRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function listJobExecutionLogs(limit = 50): Promise<DaaJobExecutionLog[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT owner_account_id, job_id, job_type, request_id, trigger_source, idempotency_key, status,
              started_at, finished_at, duration_ms, result_json, error_text, created_at
       FROM daa_job_execution_logs
       WHERE owner_account_id = $1
       ORDER BY started_at DESC, created_at DESC
       LIMIT $2`,
      [ownerAccountId, safeLimit],
    );
    return result.rows.map((row) => mapJobLogRow(row as Record<string, unknown>));
  });
}

export async function findRecentJobExecutionByIdempotencyKey(input: {
  jobType: string;
  idempotencyKey: string;
  withinMinutes: number;
  statuses?: string[];
}): Promise<DaaJobExecutionLog | null> {
  const key = normalizeText(input.idempotencyKey);
  if (!key) return null;
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const safeMinutes = Math.max(1, Math.min(90 * 24 * 60, Math.trunc(Number(input.withinMinutes) || 60)));
  const statuses = (input.statuses && input.statuses.length > 0 ? input.statuses : ["succeeded"])
    .map((status) => normalizeText(status))
    .filter(Boolean);
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT owner_account_id, job_id, job_type, request_id, trigger_source, idempotency_key, status,
              started_at, finished_at, duration_ms, result_json, error_text, created_at
       FROM daa_job_execution_logs
       WHERE owner_account_id = $1
         AND job_type = $2
         AND idempotency_key = $3
         AND started_at >= NOW() - ($4::int * INTERVAL '1 minute')
         AND status = ANY($5::text[])
       ORDER BY started_at DESC, created_at DESC
       LIMIT 1`,
      [ownerAccountId, normalizeText(input.jobType), key, safeMinutes, statuses],
    );
    return result.rows[0] ? mapJobLogRow(result.rows[0] as Record<string, unknown>) : null;
  });
}
