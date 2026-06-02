/**
 * 目标权重变更审计。
 *
 * 记录 targetWeightHint 从哪里来、为什么变化、变化前后是多少。
 * 这张流水表用于资产详情页复盘“为什么目标权重是 X%”。
 */

import { randomUUID } from "node:crypto";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { normalizeText, toFiniteNumber, toIsoString, withDaaPgClient, type DaaTxQueryFn } from "./storeShared";
import { ensureDaaStoreSchemaPg } from "./storeSchema";

export type TargetWeightAuditSource =
  | "manual_asset_patch"
  | "asset_upsert"
  | "agent_target_weight_pool"
  | "rebalance_execution"
  | "target_allocation_apply"
  | "portfolio_template_apply"
  | "strategy_lab_apply"
  | "candidate_assets_replace"
  | "system";

export type TargetWeightAuditContext = {
  source: TargetWeightAuditSource;
  reason?: string | null;
  actor?: string | null;
  agentRunId?: string | null;
  cycleId?: string | null;
  payload?: Record<string, unknown> | null;
};

export type TargetWeightAuditInput = TargetWeightAuditContext & {
  assetKey: string;
  symbol?: string | null;
  previousTargetWeightHint?: number | null;
  nextTargetWeightHint: number;
};

export type TargetWeightAuditRecord = {
  id: string;
  assetKey: string;
  symbol: string | null;
  previousTargetWeightHint: number | null;
  nextTargetWeightHint: number;
  previousTargetWeightPct: number | null;
  nextTargetWeightPct: number;
  source: TargetWeightAuditSource;
  reason: string | null;
  actor: string | null;
  agentRunId: string | null;
  cycleId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

const CHANGE_EPSILON = 1e-9;

function normalizeWeight(value: unknown): number {
  return Math.max(0, toFiniteNumber(value, 0));
}

function normalizeNullableWeight(value: unknown): number | null {
  if (value == null) return null;
  return normalizeWeight(value);
}

function hasTargetWeightChanged(previous: number | null, next: number): boolean {
  if (previous == null) return next > CHANGE_EPSILON;
  return Math.abs(previous - next) > CHANGE_EPSILON;
}

function jsonOrNull(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) return null;
  return JSON.stringify(value);
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mapAuditRow(row: Record<string, unknown>): TargetWeightAuditRecord {
  const previous = normalizeNullableWeight(row.previous_target_weight_hint);
  const next = normalizeWeight(row.next_target_weight_hint);
  return {
    id: normalizeText(row.id),
    assetKey: normalizeText(row.asset_key).toUpperCase(),
    symbol: row.symbol == null ? null : normalizeText(row.symbol).toUpperCase(),
    previousTargetWeightHint: previous,
    nextTargetWeightHint: next,
    previousTargetWeightPct: previous == null ? null : previous * 100,
    nextTargetWeightPct: next * 100,
    source: normalizeText(row.source, "system") as TargetWeightAuditSource,
    reason: row.reason == null ? null : normalizeText(row.reason) || null,
    actor: row.actor == null ? null : normalizeText(row.actor) || null,
    agentRunId: row.agent_run_id == null ? null : normalizeText(row.agent_run_id) || null,
    cycleId: row.cycle_id == null ? null : normalizeText(row.cycle_id) || null,
    payload: parseJsonObject(row.payload),
    createdAt: toIsoString(row.created_at),
  };
}

export async function recordTargetWeightAuditInTx(
  query: DaaTxQueryFn,
  input: TargetWeightAuditInput,
): Promise<string | null> {
  const ownerAccountId = getDaaAccountScopeId();
  const assetKey = normalizeText(input.assetKey).toUpperCase();
  const symbol = input.symbol == null ? null : normalizeText(input.symbol).toUpperCase() || null;
  const previous = normalizeNullableWeight(input.previousTargetWeightHint);
  const next = normalizeWeight(input.nextTargetWeightHint);
  if (!assetKey || !hasTargetWeightChanged(previous, next)) return null;

  const id = randomUUID();
  await query(
    `INSERT INTO daa_target_weight_audit (
       owner_account_id, id, asset_key, symbol,
       previous_target_weight_hint, next_target_weight_hint,
       source, reason, actor, agent_run_id, cycle_id, payload, created_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
    [
      ownerAccountId,
      id,
      assetKey,
      symbol,
      previous,
      next,
      input.source,
      normalizeText(input.reason, "").slice(0, 1000) || null,
      normalizeText(input.actor, "").slice(0, 120) || null,
      normalizeText(input.agentRunId, "").slice(0, 120) || null,
      normalizeText(input.cycleId, "").slice(0, 120) || null,
      jsonOrNull(input.payload),
    ],
  );
  return id;
}

export async function listTargetWeightAudits(input: {
  assetKey?: string | null;
  source?: TargetWeightAuditSource | null;
  agentRunId?: string | null;
  cycleId?: string | null;
  limit?: number;
} = {}): Promise<TargetWeightAuditRecord[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const assetKey = normalizeText(input.assetKey, "").toUpperCase() || null;
  const source = input.source ?? null;
  const agentRunId = normalizeText(input.agentRunId, "") || null;
  const cycleId = normalizeText(input.cycleId, "") || null;
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(input.limit ?? 20) || 20)));

  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT *
       FROM daa_target_weight_audit
       WHERE owner_account_id = $1
         AND ($2::text IS NULL OR UPPER(asset_key) = $2)
         AND ($3::text IS NULL OR source = $3)
         AND ($4::text IS NULL OR agent_run_id = $4)
         AND ($5::text IS NULL OR cycle_id = $5)
       ORDER BY created_at DESC
       LIMIT $6`,
      [ownerAccountId, assetKey, source, agentRunId, cycleId, limit],
    );
    return res.rows.map((row) => mapAuditRow(row as Record<string, unknown>));
  });
}
