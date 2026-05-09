/**
 * Agent Run Store — Agent 运行记录的持久化层
 */

import { randomUUID } from "node:crypto";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import type { AgentRun, AgentRunStatus, AgentTrigger, DailyBriefing, ReasoningTrace, Surprise, ToolCallRecord } from "@/src/daa/agent/cognitiveTypes";

function parseJsonbArray<T>(v: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return fallback;
}

function mapRunRow(r: Record<string, unknown>): AgentRun {
  return {
    id: String(r.id),
    trigger: String(r.trigger) as AgentTrigger,
    langgraphThreadId: r.langgraph_thread_id ? String(r.langgraph_thread_id) : null,
    status: String(r.status) as AgentRunStatus,
    targetThreadIds: Array.isArray(r.target_thread_ids) ? (r.target_thread_ids as string[]) : [],
    toolsCalled: parseJsonbArray<ToolCallRecord>(r.tools_called),
    reasoningTraces: parseJsonbArray<ReasoningTrace>(r.reasoning_traces),
    surprises: parseJsonbArray<Surprise>(r.surprises),
    briefing: r.briefing && typeof r.briefing === "object" ? (r.briefing as DailyBriefing) : null,
    totalTokens: Number(r.total_tokens ?? 0),
    totalCostUsd: Number(r.total_cost_usd ?? 0),
    durationMs: r.duration_ms ? Number(r.duration_ms) : null,
    createdAt: String(r.created_at),
    completedAt: r.completed_at ? String(r.completed_at) : null,
  };
}

export async function createAgentRun(data: {
  trigger: AgentTrigger;
  langgraphThreadId?: string;
}): Promise<AgentRun> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const res = await query(
      `INSERT INTO daa_agent_runs (owner_account_id, id, trigger, langgraph_thread_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ownerAccountId, id, data.trigger, data.langgraphThreadId ?? null],
    );
    return mapRunRow(res.rows[0]);
  });
}

export async function completeAgentRun(
  id: string,
  result: {
    status: AgentRunStatus;
    targetThreadIds?: string[];
    toolsCalled?: ToolCallRecord[];
    reasoningTraces?: ReasoningTrace[];
    surprises?: Surprise[];
    briefing?: DailyBriefing;
    totalTokens?: number;
    totalCostUsd?: number;
    durationMs?: number;
  },
): Promise<void> {
  const ownerAccountId = getDaaAccountScopeId();
  await withDaaPgClient(async ({ query }) => {
    await query(
      `UPDATE daa_agent_runs SET
         status = $1,
         target_thread_ids = $2,
         tools_called = $3,
         reasoning_traces = $4,
         surprises = $5,
         briefing = $6,
         total_tokens = $7,
         total_cost_usd = $8,
         duration_ms = $9,
         completed_at = now()
       WHERE owner_account_id = $10 AND id = $11`,
      [
        result.status,
        result.targetThreadIds ?? [],
        JSON.stringify(result.toolsCalled ?? []),
        JSON.stringify(result.reasoningTraces ?? []),
        JSON.stringify(result.surprises ?? []),
        result.briefing ? JSON.stringify(result.briefing) : null,
        result.totalTokens ?? 0,
        result.totalCostUsd ?? 0,
        result.durationMs ?? null,
        ownerAccountId,
        id,
      ],
    );
  });
}

export async function getLatestRun(): Promise<AgentRun | null> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(`SELECT * FROM daa_agent_runs WHERE owner_account_id = $1 ORDER BY created_at DESC LIMIT 1`, [ownerAccountId]);
    return res.rows[0] ? mapRunRow(res.rows[0]) : null;
  });
}
