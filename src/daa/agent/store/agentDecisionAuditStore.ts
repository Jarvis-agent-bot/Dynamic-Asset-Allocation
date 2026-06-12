/**
 * 投资助理决策审计 Store。
 *
 * 这里记录“投资助理当时看到了什么、做了什么判断、为什么这样判断”，
 * 用于后续按 run / cycle / asset 复盘目标权重和 thesis review。
 */

import { randomUUID } from "node:crypto";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";

export type AgentDecisionKind =
  | "strategy_target_allocation"
  | "strategy_regime_override"
  | "strategy_plan_summary"
  | "thesis_review"
  | "human_daily_decision";

export type AgentDecisionAuditInput = {
  agentRunId?: string | null;
  cycleId?: string | null;
  node: string;
  decisionKind: AgentDecisionKind;
  assetKey?: string | null;
  symbol?: string | null;
  summary?: string | null;
  reasoning?: string | null;
  confidencePct?: number | null;
  inputSnapshot?: Record<string, unknown> | null;
  evidenceSnapshot?: Record<string, unknown> | null;
  decisionPayload?: Record<string, unknown> | null;
};

export type AgentDecisionAuditRecord = AgentDecisionAuditInput & {
  id: string;
  createdAt: string;
};

function normalizeText(value: unknown, maxLength: number): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeConfidencePct(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function jsonOrNull(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) return null;
  return JSON.stringify(value);
}

export async function recordAgentDecisionAudit(input: AgentDecisionAuditInput): Promise<string> {
  const ownerAccountId = getDaaAccountScopeId();
  const id = randomUUID();
  await withDaaPgClient(async ({ query }) => {
    await query(
      `INSERT INTO daa_agent_decision_audit (
         owner_account_id, id, agent_run_id, cycle_id, node, decision_kind,
         asset_key, symbol, summary, reasoning, confidence_pct,
         input_snapshot, evidence_snapshot, decision_payload
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        ownerAccountId,
        id,
        normalizeText(input.agentRunId, 120),
        normalizeText(input.cycleId, 120),
        normalizeText(input.node, 80) ?? "unknown",
        input.decisionKind,
        normalizeText(input.assetKey, 120),
        normalizeText(input.symbol, 80),
        normalizeText(input.summary, 500),
        normalizeText(input.reasoning, 2000),
        normalizeConfidencePct(input.confidencePct),
        jsonOrNull(input.inputSnapshot),
        jsonOrNull(input.evidenceSnapshot),
        jsonOrNull(input.decisionPayload),
      ],
    );
  });
  return id;
}

export async function recordAgentDecisionAudits(inputs: AgentDecisionAuditInput[]): Promise<string[]> {
  const ids: string[] = [];
  for (const input of inputs) {
    ids.push(await recordAgentDecisionAudit(input));
  }
  return ids;
}

export async function attachCycleToAgentDecisionAudits(input: {
  agentRunId?: string | null;
  cycleId: string;
  assetKeys?: string[];
  decisionKinds?: AgentDecisionKind[];
}): Promise<number> {
  const agentRunId = normalizeText(input.agentRunId, 120);
  if (!agentRunId || !input.cycleId) return 0;

  const ownerAccountId = getDaaAccountScopeId();
  const assetKeys = (input.assetKeys ?? [])
    .map((assetKey) => String(assetKey || "").trim().toUpperCase())
    .filter(Boolean);
  const decisionKinds = input.decisionKinds ?? ["strategy_target_allocation", "strategy_plan_summary"];

  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `UPDATE daa_agent_decision_audit
       SET cycle_id = $1
       WHERE owner_account_id = $2
         AND agent_run_id = $3
         AND decision_kind = ANY($4::text[])
         AND ($5::boolean OR UPPER(COALESCE(asset_key, '')) = ANY($6::text[]))`,
      [
        input.cycleId,
        ownerAccountId,
        agentRunId,
        decisionKinds,
        assetKeys.length === 0,
        assetKeys,
      ],
    );
    return res.rowCount ?? 0;
  });
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return null;
}

function mapAuditRow(row: Record<string, unknown>): AgentDecisionAuditRecord {
  return {
    id: String(row.id),
    agentRunId: row.agent_run_id == null ? null : String(row.agent_run_id),
    cycleId: row.cycle_id == null ? null : String(row.cycle_id),
    node: String(row.node || "unknown"),
    decisionKind: String(row.decision_kind || "strategy_plan_summary") as AgentDecisionKind,
    assetKey: row.asset_key == null ? null : String(row.asset_key),
    symbol: row.symbol == null ? null : String(row.symbol),
    summary: row.summary == null ? null : String(row.summary),
    reasoning: row.reasoning == null ? null : String(row.reasoning),
    confidencePct: row.confidence_pct == null ? null : Number(row.confidence_pct),
    inputSnapshot: parseJsonObject(row.input_snapshot),
    evidenceSnapshot: parseJsonObject(row.evidence_snapshot),
    decisionPayload: parseJsonObject(row.decision_payload),
    createdAt: String(row.created_at),
  };
}

export async function listAgentDecisionAudits(input: {
  agentRunId?: string | null;
  cycleId?: string | null;
  assetKey?: string | null;
  decisionKind?: AgentDecisionKind | null;
  limit?: number;
} = {}): Promise<AgentDecisionAuditRecord[]> {
  const ownerAccountId = getDaaAccountScopeId();
  const limit = Math.max(1, Math.min(200, Number(input.limit ?? 50) || 50));
  const agentRunId = normalizeText(input.agentRunId, 120);
  const cycleId = normalizeText(input.cycleId, 120);
  const assetKey = normalizeText(input.assetKey, 120);
  const decisionKind = input.decisionKind ?? null;

  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT *
       FROM daa_agent_decision_audit
       WHERE owner_account_id = $1
         AND ($2::text IS NULL OR agent_run_id = $2)
         AND ($3::text IS NULL OR cycle_id = $3)
         AND ($4::text IS NULL OR UPPER(asset_key) = UPPER($4))
         AND ($5::text IS NULL OR decision_kind = $5)
       ORDER BY created_at DESC
       LIMIT $6`,
      [ownerAccountId, agentRunId, cycleId, assetKey, decisionKind, limit],
    );
    return res.rows.map(mapAuditRow);
  });
}
