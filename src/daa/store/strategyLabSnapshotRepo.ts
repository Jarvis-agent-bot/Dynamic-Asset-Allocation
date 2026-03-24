import { randomUUID } from "node:crypto";

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { ensureDaaStoreSchemaPg } from "@/src/daa/store/daaStorePg";
import { normalizeText } from "@/src/daa/utils/normalize";

export type DaaStrategyLabRunSnapshot = {
  runId: string;
  createdAt: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
  requestJson: Record<string, unknown>;
  summaryJson: Record<string, unknown>;
};

function toIsoString(value: unknown, fallback = new Date().toISOString()): string {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapSnapshotRow(row: Record<string, unknown>): DaaStrategyLabRunSnapshot {
  return {
    runId: normalizeText(row.run_id),
    createdAt: toIsoString(row.created_at),
    baseCurrency: normalizeText(row.base_currency, "USD").toUpperCase(),
    startDate: normalizeText(row.start_date),
    endDate: normalizeText(row.end_date),
    requestJson: parseJsonObject(row.request_json),
    summaryJson: parseJsonObject(row.summary_json),
  };
}

export async function appendStrategyLabRunSnapshot(input: {
  runId?: string;
  createdAt?: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
  requestJson?: Record<string, unknown>;
  summaryJson?: Record<string, unknown>;
}): Promise<DaaStrategyLabRunSnapshot> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const runId = normalizeText(input.runId) || randomUUID();
    const createdAt = toIsoString(input.createdAt, new Date().toISOString());
    const baseCurrency = normalizeText(input.baseCurrency, "USD").toUpperCase();
    const startDate = normalizeText(input.startDate);
    const endDate = normalizeText(input.endDate);
    const requestJson = input.requestJson && typeof input.requestJson === "object" ? input.requestJson : {};
    const summaryJson = input.summaryJson && typeof input.summaryJson === "object" ? input.summaryJson : {};

    const result = await query(
      `INSERT INTO daa_strategy_lab_run_snapshots (
        run_id, created_at, base_currency, start_date, end_date, request_json, summary_json
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb
      )
      ON CONFLICT (run_id) DO UPDATE
      SET created_at = EXCLUDED.created_at,
          base_currency = EXCLUDED.base_currency,
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          request_json = EXCLUDED.request_json,
          summary_json = EXCLUDED.summary_json
      RETURNING run_id, created_at, base_currency, start_date, end_date, request_json, summary_json`,
      [
        runId,
        createdAt,
        baseCurrency,
        startDate,
        endDate,
        JSON.stringify(requestJson),
        JSON.stringify(summaryJson),
      ],
    );
    return mapSnapshotRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function listStrategyLabRunSnapshots(limit = 20): Promise<DaaStrategyLabRunSnapshot[]> {
  await ensureDaaStoreSchemaPg();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 20)));
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT run_id, created_at, base_currency, start_date, end_date, request_json, summary_json
       FROM daa_strategy_lab_run_snapshots
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map((row) => mapSnapshotRow(row as Record<string, unknown>));
  });
}
