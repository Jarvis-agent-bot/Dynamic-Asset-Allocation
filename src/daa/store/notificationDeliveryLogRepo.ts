import { randomUUID } from "node:crypto";

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { ensureDaaStoreSchemaPg } from "@/src/daa/store/daaStorePg";
import { normalizeText } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type DaaNotificationChannel = "telegram" | "feishu";

export type DaaNotificationDeliveryLog = {
  id: string;
  channel: DaaNotificationChannel;
  eventType: string;
  triggerSource: string;
  success: boolean;
  statusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  recipientHint: string | null;
  jobId: string | null;
  cycleId: string | null;
  ticketId: string | null;
  requestJson: Record<string, unknown> | null;
  responseJson: Record<string, unknown> | null;
  createdAt: string;
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

function toNullableNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch (err) {
      logSwallowed("notificationDeliveryLogRepo.parseJsonb", err);
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeChannel(value: unknown): DaaNotificationChannel {
  return normalizeText(value, "telegram").toLowerCase() === "feishu" ? "feishu" : "telegram";
}

function mapNotificationDeliveryRow(row: Record<string, unknown>): DaaNotificationDeliveryLog {
  return {
    id: normalizeText(row.id),
    channel: normalizeChannel(row.channel),
    eventType: normalizeText(row.event_type, "unknown"),
    triggerSource: normalizeText(row.trigger_source, "unknown"),
    success: Boolean(row.success),
    statusCode: toNullableNumber(row.status_code),
    errorCode: row.error_code == null ? null : normalizeText(row.error_code) || null,
    errorMessage: row.error_message == null ? null : normalizeText(row.error_message) || null,
    recipientHint: row.recipient_hint == null ? null : normalizeText(row.recipient_hint) || null,
    jobId: row.job_id == null ? null : normalizeText(row.job_id) || null,
    cycleId: row.cycle_id == null ? null : normalizeText(row.cycle_id) || null,
    ticketId: row.ticket_id == null ? null : normalizeText(row.ticket_id) || null,
    requestJson: parseJsonObject(row.request_json),
    responseJson: parseJsonObject(row.response_json),
    createdAt: toIsoString(row.created_at),
  };
}

export async function appendNotificationDeliveryLog(input: {
  id?: string;
  channel: DaaNotificationChannel;
  eventType: string;
  triggerSource?: string;
  success: boolean;
  statusCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  recipientHint?: string | null;
  jobId?: string | null;
  cycleId?: string | null;
  ticketId?: string | null;
  requestJson?: Record<string, unknown> | null;
  responseJson?: Record<string, unknown> | null;
}): Promise<DaaNotificationDeliveryLog> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const id = normalizeText(input.id) || randomUUID();
    const result = await query(
      `INSERT INTO daa_notification_delivery_logs (
        id, channel, event_type, trigger_source, success, status_code, error_code, error_message,
        recipient_hint, job_id, cycle_id, ticket_id, request_json, response_json
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13::jsonb,$14::jsonb
      )
      RETURNING id, channel, event_type, trigger_source, success, status_code, error_code, error_message,
                recipient_hint, job_id, cycle_id, ticket_id, request_json, response_json, created_at`,
      [
        id,
        input.channel,
        normalizeText(input.eventType, "unknown"),
        normalizeText(input.triggerSource, "unknown"),
        Boolean(input.success),
        input.statusCode == null ? null : Math.trunc(Number(input.statusCode) || 0),
        input.errorCode ? normalizeText(input.errorCode) : null,
        input.errorMessage ? normalizeText(input.errorMessage) : null,
        input.recipientHint ? normalizeText(input.recipientHint) : null,
        input.jobId ? normalizeText(input.jobId) : null,
        input.cycleId ? normalizeText(input.cycleId) : null,
        input.ticketId ? normalizeText(input.ticketId) : null,
        JSON.stringify(input.requestJson && typeof input.requestJson === "object" ? input.requestJson : null),
        JSON.stringify(input.responseJson && typeof input.responseJson === "object" ? input.responseJson : null),
      ],
    );
    return mapNotificationDeliveryRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function listNotificationDeliveryLogs(input: {
  limit?: number;
  channel?: DaaNotificationChannel | null;
} = {}): Promise<DaaNotificationDeliveryLog[]> {
  await ensureDaaStoreSchemaPg();
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(input.limit) || 20)));
  return withDaaPgClient(async ({ query }) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.channel) {
      params.push(input.channel);
      where.push(`channel = $${params.length}`);
    }
    params.push(limit);
    const result = await query(
      `SELECT id, channel, event_type, trigger_source, success, status_code, error_code, error_message,
              recipient_hint, job_id, cycle_id, ticket_id, request_json, response_json, created_at
       FROM daa_notification_delivery_logs
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapNotificationDeliveryRow(row as Record<string, unknown>));
  });
}
