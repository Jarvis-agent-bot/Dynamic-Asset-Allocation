import { randomUUID } from "node:crypto";

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { ensureDaaStoreSchemaPg } from "@/src/daa/store/daaStorePg";
import { toIsoString, toNullableNumber, parseJsonb } from "@/src/daa/store/storeShared";
import { normalizeText } from "@/src/daa/utils/normalize";

export type DaaJobExecutionLog = {
  jobId: string;
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
  return withDaaPgClient(async ({ query }) => {
    const jobId = normalizeText(input.jobId) || randomUUID();
    const result = await query(
      `INSERT INTO daa_job_execution_logs (
        job_id, job_type, request_id, trigger_source, idempotency_key, status,
        started_at, finished_at, duration_ms, result_json, error_text
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10::jsonb, $11
      )
      ON CONFLICT (job_id) DO UPDATE
      SET job_type = EXCLUDED.job_type,
          request_id = EXCLUDED.request_id,
          trigger_source = EXCLUDED.trigger_source,
          idempotency_key = EXCLUDED.idempotency_key,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          finished_at = EXCLUDED.finished_at,
          duration_ms = EXCLUDED.duration_ms,
          result_json = EXCLUDED.result_json,
          error_text = EXCLUDED.error_text
      RETURNING job_id, job_type, request_id, trigger_source, idempotency_key, status, started_at, finished_at, duration_ms, result_json, error_text, created_at`,
      [
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
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT job_id, job_type, request_id, trigger_source, idempotency_key, status,
              started_at, finished_at, duration_ms, result_json, error_text, created_at
       FROM daa_job_execution_logs
       ORDER BY started_at DESC, created_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map((row) => mapJobLogRow(row as Record<string, unknown>));
  });
}
