import { randomUUID } from "node:crypto";

import { daaPgPool } from "@/src/daa/pg/daaPg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeText } from "@/src/daa/utils/normalize";

export type DaaAgentLearningEvent = {
  eventId: string;
  eventType: string;
  title: string;
  summary: string;
  sessionId: string | null;
  cycleId: string | null;
  symbol: string | null;
  createdAt: string;
  contextJson: Record<string, unknown>;
};

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "";
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : text;
  }
  return "";
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch (err) {
      logSwallowed("agentLearningRepo.parseJsonb", err);
      return {};
    }
  }
  return {};
}

async function ensureAgentLearningTable() {
  const pool = daaPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daa_agent_learning_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      session_id TEXT NULL,
      cycle_id TEXT NULL,
      symbol TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      context_json JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS daa_agent_learning_events_created_idx ON daa_agent_learning_events(created_at DESC)",
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS daa_agent_learning_events_cycle_idx ON daa_agent_learning_events(cycle_id) WHERE cycle_id IS NOT NULL",
  );
}

function mapLearningEventRow(row: Record<string, unknown>): DaaAgentLearningEvent {
  return {
    eventId: normalizeText(row.event_id),
    eventType: normalizeText(row.event_type),
    title: normalizeText(row.title),
    summary: normalizeText(row.summary),
    sessionId: normalizeText(row.session_id) || null,
    cycleId: normalizeText(row.cycle_id) || null,
    symbol: normalizeText(row.symbol) || null,
    createdAt: toIsoString(row.created_at),
    contextJson: parseJsonObject(row.context_json),
  };
}

export async function appendAgentLearningEvent(input: {
  eventType: string;
  title: string;
  summary: string;
  sessionId?: string | null;
  cycleId?: string | null;
  symbol?: string | null;
  contextJson?: Record<string, unknown>;
}): Promise<DaaAgentLearningEvent> {
  await ensureAgentLearningTable();
  const pool = daaPgPool();
  const result = await pool.query(
    `INSERT INTO daa_agent_learning_events (
      event_id, event_type, title, summary, session_id, cycle_id, symbol, context_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    RETURNING *`,
    [
      randomUUID(),
      normalizeText(input.eventType),
      normalizeText(input.title).slice(0, 160),
      normalizeText(input.summary).slice(0, 1200),
      input.sessionId || null,
      input.cycleId || null,
      input.symbol || null,
      JSON.stringify(input.contextJson || {}),
    ],
  );
  return mapLearningEventRow(result.rows[0] as Record<string, unknown>);
}

export async function listRecentAgentLearningEvents(limit = 8): Promise<DaaAgentLearningEvent[]> {
  await ensureAgentLearningTable();
  const pool = daaPgPool();
  const result = await pool.query(
    `SELECT *
     FROM daa_agent_learning_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(40, Math.trunc(limit)))],
  );
  return result.rows.map((row) => mapLearningEventRow(row as Record<string, unknown>));
}

export async function buildAgentLearningDigest(limit = 6): Promise<string> {
  const items = await listRecentAgentLearningEvents(limit);
  if (items.length === 0) return "暂无可复用的历史复盘经验。";

  const lines = items.map((item) => (
    `${item.createdAt.slice(0, 10)} | ${item.eventType} | ${item.title} | ${item.summary}`
  ));

  // 统计 outcome_verdict 事件的准确率
  const verdictEvents = items.filter(i => i.eventType === "outcome_verdict");
  if (verdictEvents.length > 0) {
    const correct = verdictEvents.filter(i => {
      const v = i.contextJson?.verdict as string;
      return v === "actionable_move" || v === "correct_hold" || v === "correct_skip";
    }).length;
    const missed = verdictEvents.filter(i => i.contextJson?.verdict === "missed_opportunity").length;
    const unexpected = verdictEvents.filter(i => i.contextJson?.verdict === "unexpected_move").length;
    lines.push(`\n历史决策表现: 最近${verdictEvents.length}次后验中, ${correct}次正确, ${missed}次错失机会, ${unexpected}次意外波动.`);
  }

  return lines.join("\n");
}
