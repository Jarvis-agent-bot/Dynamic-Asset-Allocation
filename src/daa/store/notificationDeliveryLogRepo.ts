import { randomUUID } from "node:crypto";

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { ensureDaaStoreSchemaPg } from "@/src/daa/store/daaStorePg";
import { toIsoString, toNullableNumber, parseJsonb } from "@/src/daa/store/storeShared";
import { normalizeText } from "@/src/daa/utils/normalize";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";

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
    requestJson: parseJsonb<Record<string, unknown> | null>(row.request_json, null),
    responseJson: parseJsonb<Record<string, unknown> | null>(row.response_json, null),
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
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const id = normalizeText(input.id) || randomUUID();
    const result = await query(
      `INSERT INTO daa_notification_delivery_logs (
        owner_account_id, id, channel, event_type, trigger_source, success, status_code, error_code, error_message,
        recipient_hint, job_id, cycle_id, ticket_id, request_json, response_json
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14::jsonb,$15::jsonb
      )
      RETURNING id, channel, event_type, trigger_source, success, status_code, error_code, error_message,
                recipient_hint, job_id, cycle_id, ticket_id, request_json, response_json, created_at`,
      [
        ownerAccountId,
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

/**
 * 检查指定 symbol + eventType 是否在最近 N 小时内已成功推送过重大新闻通知。
 * 用于 news-refresh cron 的 DB 级去重，防止 Serverless 冷启动后重复推送。
 */
export async function hasRecentMajorEventNotification(input: {
  symbol: string;
  majorEventType: string;
  withinHours?: number;
}): Promise<boolean> {
  await ensureDaaStoreSchemaPg();
  const hours = input.withinHours ?? 24;
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT 1 FROM daa_notification_delivery_logs
       WHERE owner_account_id = $1
         AND event_type = 'news_major_event'
         AND success = TRUE
         AND created_at > NOW() - make_interval(hours => $2)
         AND request_json->>'symbol' = $3
         AND request_json->>'majorEventType' = $4
       LIMIT 1`,
      [ownerAccountId, hours, input.symbol, input.majorEventType],
    );
    return result.rows.length > 0;
  });
}

/**
 * 检查今天是否已成功发送过指定 eventType 的通知。
 * 用于每日报告等每天只发一次的通知去重。
 */
export async function hasTodayNotification(eventType: string): Promise<boolean> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT 1 FROM daa_notification_delivery_logs
       WHERE owner_account_id = $1
         AND event_type = $2
         AND success = TRUE
         AND created_at >= CURRENT_DATE
       LIMIT 1`,
      [ownerAccountId, eventType],
    );
    return result.rows.length > 0;
  });
}

/**
 * 检查当前账号近期是否已成功投递同类通知。
 * throttleKey 用于价格报警等细粒度场景，同一天不同触发项不会互相误伤。
 */
export async function hasRecentNotification(input: {
  eventType: string;
  withinMinutes: number;
  throttleKey?: string | null;
}): Promise<boolean> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const eventType = normalizeText(input.eventType, "unknown");
  const withinMinutes = Math.max(1, Math.min(7 * 24 * 60, Math.trunc(Number(input.withinMinutes) || 60)));
  const throttleKey = input.throttleKey ? normalizeText(input.throttleKey) || null : null;

  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT 1 FROM daa_notification_delivery_logs
       WHERE owner_account_id = $1
         AND event_type = $2
         AND success = TRUE
         AND created_at > NOW() - ($3::int * INTERVAL '1 minute')
         AND (
           $4::text IS NULL
           OR request_json->>'throttleKey' = $4::text
           OR COALESCE(request_json->'throttleKeys', '[]'::jsonb) ? $4::text
         )
       LIMIT 1`,
      [ownerAccountId, eventType, withinMinutes, throttleKey],
    );
    return result.rows.length > 0;
  });
}

export async function listNotificationDeliveryLogs(input: {
  limit?: number;
  channel?: DaaNotificationChannel | null;
} = {}): Promise<DaaNotificationDeliveryLog[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(input.limit) || 20)));
  return withDaaPgClient(async ({ query }) => {
    const where: string[] = ["owner_account_id = $1"];
    const params: unknown[] = [ownerAccountId];
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
