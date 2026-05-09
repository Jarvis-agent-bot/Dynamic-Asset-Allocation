/**
 * Run-history and op-log store functions.
 */

import { randomUUID } from "node:crypto";
import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { withDaaPgClient, parseJsonb, toIsoString } from "./storeShared";
import type { DaaStoreRunHistoryEntry, DaaStoreOpLogEntry } from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";

function mapRunHistoryRow(row: Record<string, unknown>): DaaStoreRunHistoryEntry {
  return {
    id: normalizeText(row.id),
    ts: toIsoString(row.ts),
    triggerSource: normalizeText(row.trigger_source, "manual"),
    requestJson: parseJsonb<Record<string, unknown>>(row.request_json, {}),
    responseJson: parseJsonb<Record<string, unknown>>(row.response_json, {}),
    summaryJson: parseJsonb<Record<string, unknown>>(row.summary_json, {}),
  };
}

function mapOpLogRow(row: Record<string, unknown>): DaaStoreOpLogEntry {
  const normalizedLevel = normalizeText(row.level, "info").toLowerCase();
  const level = normalizedLevel === "warn" || normalizedLevel === "error" ? normalizedLevel : "info";
  return {
    id: normalizeText(row.id),
    ts: toIsoString(row.ts),
    level,
    message: normalizeText(row.message),
    contextJson: parseJsonb<Record<string, unknown>>(row.context_json, {}),
  };
}

export async function appendDaaRunHistory(input: {
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  summaryJson?: Record<string, unknown>;
  triggerSource?: string;
}): Promise<DaaStoreRunHistoryEntry> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const triggerSource = normalizeText(input.triggerSource, "manual");
    await query(
      "INSERT INTO daa_run_history (owner_account_id, id, ts, trigger_source, request_json, response_json, summary_json) VALUES ($1, $2, NOW(), $3, $4, $5, $6)",
      [
        ownerAccountId,
        id,
        triggerSource,
        JSON.stringify(input.requestJson || {}),
        JSON.stringify(input.responseJson || {}),
        JSON.stringify(input.summaryJson || {}),
      ],
    );

    const result = await query(
      "SELECT id, ts, trigger_source, request_json, response_json, summary_json FROM daa_run_history WHERE owner_account_id = $1 AND id = $2 LIMIT 1",
      [ownerAccountId, id],
    );
    return mapRunHistoryRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaRunHistory(limit = 50): Promise<DaaStoreRunHistoryEntry[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const n = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(limit, 50))));
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT id, ts, trigger_source, request_json, response_json, summary_json FROM daa_run_history WHERE owner_account_id = $1 ORDER BY ts DESC LIMIT $2",
      [ownerAccountId, n],
    );
    return result.rows.map((row) => mapRunHistoryRow(row as Record<string, unknown>));
  });
}

export async function appendDaaOpLog(input: {
  level?: "info" | "warn" | "error";
  message: string;
  contextJson?: Record<string, unknown>;
}): Promise<DaaStoreOpLogEntry> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const level = normalizeText(input.level, "info").toLowerCase();
    const normalizedLevel = level === "warn" || level === "error" ? level : "info";
    const message = normalizeText(input.message);
    if (!message) throw new Error("op log message required");

    await query(
      "INSERT INTO daa_op_log (owner_account_id, id, ts, level, message, context_json) VALUES ($1, $2, NOW(), $3, $4, $5)",
      [ownerAccountId, id, normalizedLevel, message, JSON.stringify(input.contextJson || {})],
    );

    const result = await query(
      "SELECT id, ts, level, message, context_json FROM daa_op_log WHERE owner_account_id = $1 AND id = $2 LIMIT 1",
      [ownerAccountId, id],
    );
    return mapOpLogRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaOpLog(limit = 100): Promise<DaaStoreOpLogEntry[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const n = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(limit, 100))));
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT id, ts, level, message, context_json FROM daa_op_log WHERE owner_account_id = $1 ORDER BY ts DESC LIMIT $2",
      [ownerAccountId, n],
    );
    return result.rows.map((row) => mapOpLogRow(row as Record<string, unknown>));
  });
}
