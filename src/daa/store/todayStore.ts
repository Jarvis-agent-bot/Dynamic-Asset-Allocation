/**
 * todayStore.ts
 *
 * /today 决策日志 + 缓存存储层
 */

import { withDaaPgClient, parseJsonb, toIsoString, toIsoStringOrNull } from "./storeShared";
import { toFinite } from "@/src/daa/utils/normalize";
import type {
  DecisionLogEntry,
  DecisionUserAction,
  TodayConclusion,
  TodayDecisionContext,
  TodayLlmOutput,
} from "@/src/daa/modules/today/todayTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Decision Log
// ─────────────────────────────────────────────────────────────────────────────

export async function insertDecisionLog(entry: {
  accountId?: string;
  assetKey: string;
  conclusion: TodayConclusion;
  userAction: DecisionUserAction;
  llmReason?: string;
  signalSnapshot?: Record<string, unknown>;
}): Promise<void> {
  await withDaaPgClient(async ({ query }) => {
    await query(
      `INSERT INTO daa_decision_log (account_id, asset_key, conclusion, user_action, llm_reason, signal_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.accountId ?? "default",
        entry.assetKey,
        entry.conclusion,
        entry.userAction,
        entry.llmReason ?? null,
        entry.signalSnapshot ? JSON.stringify(entry.signalSnapshot) : null,
      ],
    );
  });
}

export async function listRecentDecisions(
  accountId = "default",
  limit = 20,
): Promise<DecisionLogEntry[]> {
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT id, account_id, created_at, asset_key, conclusion, user_action,
              llm_reason, signal_snapshot, outcome_checked_at, outcome_result
       FROM daa_decision_log
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [accountId, limit],
    );
    return result.rows.map(mapDecisionLogRow);
  });
}

export async function listUncheckedDecisions(
  minAgeDays = 1,
  maxAgeDays = 7,
): Promise<DecisionLogEntry[]> {
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT id, account_id, created_at, asset_key, conclusion, user_action,
              llm_reason, signal_snapshot, outcome_checked_at, outcome_result
       FROM daa_decision_log
       WHERE outcome_checked_at IS NULL
         AND user_action IN ('adopted', 'ignored')
         AND created_at < NOW() - INTERVAL '1 day' * $1
         AND created_at > NOW() - INTERVAL '1 day' * $2
       ORDER BY created_at ASC`,
      [minAgeDays, maxAgeDays],
    );
    return result.rows.map(mapDecisionLogRow);
  });
}

export async function updateDecisionOutcome(
  id: number,
  outcomeResult: Record<string, unknown>,
): Promise<void> {
  await withDaaPgClient(async ({ query }) => {
    await query(
      `UPDATE daa_decision_log
       SET outcome_checked_at = NOW(), outcome_result = $2
       WHERE id = $1`,
      [id, JSON.stringify(outcomeResult)],
    );
  });
}

function mapDecisionLogRow(row: Record<string, unknown>): DecisionLogEntry {
  return {
    id: toFinite(row.id, 0),
    accountId: String(row.account_id ?? "default"),
    createdAt: toIsoString(row.created_at),
    assetKey: String(row.asset_key ?? ""),
    conclusion: String(row.conclusion ?? "watch") as TodayConclusion,
    userAction: String(row.user_action ?? "deferred") as DecisionUserAction,
    llmReason: row.llm_reason ? String(row.llm_reason) : null,
    signalSnapshot: parseJsonb<Record<string, unknown> | null>(row.signal_snapshot, null),
    outcomeCheckedAt: toIsoStringOrNull(row.outcome_checked_at),
    outcomeResult: parseJsonb<Record<string, unknown> | null>(row.outcome_result, null),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Today Cache
// ─────────────────────────────────────────────────────────────────────────────

export type TodayCacheRow = {
  id: number;
  accountId: string;
  cachedAt: string;
  decisionContext: TodayDecisionContext;
  llmOutput: TodayLlmOutput;
  isStale: boolean;
};

export async function getLatestTodayCache(accountId = "default"): Promise<TodayCacheRow | null> {
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT id, account_id, cached_at, decision_context, llm_output, is_stale
       FROM daa_today_cache
       WHERE account_id = $1
       ORDER BY cached_at DESC
       LIMIT 1`,
      [accountId],
    );
    if (result.rows.length === 0) return null;
    return mapTodayCacheRow(result.rows[0]);
  });
}

export async function upsertTodayCache(entry: {
  accountId?: string;
  decisionContext: TodayDecisionContext;
  llmOutput: TodayLlmOutput;
}): Promise<void> {
  await withDaaPgClient(async ({ query }) => {
    const accountId = entry.accountId ?? "default";
    // 标记旧缓存为 stale
    await query(
      `UPDATE daa_today_cache SET is_stale = true WHERE account_id = $1 AND is_stale = false`,
      [accountId],
    );
    // 插入新缓存
    await query(
      `INSERT INTO daa_today_cache (account_id, decision_context, llm_output)
       VALUES ($1, $2, $3)`,
      [accountId, JSON.stringify(entry.decisionContext), JSON.stringify(entry.llmOutput)],
    );
  });
}

/** 清理超过 24 小时的旧缓存（供 cache-cleanup cron 调用） */
export async function cleanupStaleTodayCache(): Promise<number> {
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `DELETE FROM daa_today_cache WHERE cached_at < NOW() - INTERVAL '24 hours'`,
    );
    return Math.max(0, Math.trunc(toFinite((result as unknown as { rowCount?: number }).rowCount, 0)));
  });
}

function mapTodayCacheRow(row: Record<string, unknown>): TodayCacheRow {
  return {
    id: toFinite(row.id, 0),
    accountId: String(row.account_id ?? "default"),
    cachedAt: toIsoString(row.cached_at),
    decisionContext: parseJsonb<TodayDecisionContext>(row.decision_context, {} as TodayDecisionContext),
    llmOutput: parseJsonb<TodayLlmOutput>(row.llm_output, {
      status: "degraded",
      conclusion: "watch",
      reason: "缓存数据不可用",
      dissent: "",
      riskWarning: "",
      missingInfo: "",
      generatedAt: "",
    }),
    isStale: row.is_stale === true,
  };
}
