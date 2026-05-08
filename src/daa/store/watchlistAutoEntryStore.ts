/**
 * Watchlist Auto-Entry Store — daa_watchlist_entries 自动建仓字段的读写层。
 *
 * 与常规 watchlist 元数据（watch_enabled/notes/price_alert）分开管理，
 * 便于上层（信号触发服务）做最小查询。
 */

import { withDaaPgClient, toFinite } from "./storeShared";
import { ensureDaaStoreSchemaPg } from "./storeSchema";
import { normalizeText } from "@/src/daa/utils/normalize";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";

export type WatchlistEntryRulesOverride = {
  minTechnicalScore?: number;
  minValuationScore?: number;
  minFusionScore?: number;
  requireStrongMomentum?: boolean;
};

export type WatchlistAutoEntryRow = {
  assetKey: string;
  autoEntryEnabled: boolean;
  entryTargetWeightPct: number | null;
  entryRules: WatchlistEntryRulesOverride | null;
  entryCooldownDays: number;
  lastEntryTriggeredAt: string | null;
};

function mapRow(row: Record<string, unknown>): WatchlistAutoEntryRow {
  const rules = row.entry_rules_json;
  let parsedRules: WatchlistEntryRulesOverride | null = null;
  if (rules && typeof rules === "object") {
    parsedRules = rules as WatchlistEntryRulesOverride;
  } else if (typeof rules === "string" && rules.length > 0) {
    try { parsedRules = JSON.parse(rules) as WatchlistEntryRulesOverride; } catch { parsedRules = null; }
  }
  return {
    assetKey: String(row.asset_key || ""),
    autoEntryEnabled: Boolean(row.auto_entry_enabled),
    entryTargetWeightPct: row.entry_target_weight_pct == null ? null : toFinite(row.entry_target_weight_pct),
    entryRules: parsedRules,
    entryCooldownDays: Math.max(1, Math.trunc(toFinite(row.entry_cooldown_days, 14))),
    lastEntryTriggeredAt: row.last_entry_triggered_at == null
      ? null
      : (row.last_entry_triggered_at instanceof Date
        ? row.last_entry_triggered_at.toISOString()
        : String(row.last_entry_triggered_at)),
  };
}

/** 列出所有启用自动建仓的 watchlist 资产（由上层按持仓/冷静期再筛选）。 */
export async function listActiveWatchlistAutoEntries(): Promise<WatchlistAutoEntryRow[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT asset_key, auto_entry_enabled, entry_target_weight_pct,
              entry_rules_json, entry_cooldown_days, last_entry_triggered_at
       FROM daa_watchlist_entries
       WHERE owner_account_id = $1 AND auto_entry_enabled = TRUE AND watch_enabled = TRUE`,
      [ownerAccountId],
    );
    return result.rows.map((r) => mapRow(r as Record<string, unknown>));
  });
}

/** 获取单条资产的自动建仓配置。 */
export async function getWatchlistAutoEntry(assetKey: string): Promise<WatchlistAutoEntryRow | null> {
  const key = normalizeText(assetKey).toUpperCase();
  if (!key) return null;
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT asset_key, auto_entry_enabled, entry_target_weight_pct,
              entry_rules_json, entry_cooldown_days, last_entry_triggered_at
       FROM daa_watchlist_entries WHERE owner_account_id = $1 AND asset_key = $2 LIMIT 1`,
      [ownerAccountId, key],
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
  });
}

export type WatchlistAutoEntryUpdate = {
  autoEntryEnabled?: boolean;
  entryTargetWeightPct?: number | null;
  entryRules?: WatchlistEntryRulesOverride | null;
  entryCooldownDays?: number;
};

/** 更新自动建仓配置。要求 watchlist 条目已存在（由 upsertWatchlistEntry 保证）。 */
export async function updateWatchlistAutoEntry(
  assetKey: string,
  update: WatchlistAutoEntryUpdate,
): Promise<WatchlistAutoEntryRow | null> {
  const key = normalizeText(assetKey).toUpperCase();
  if (!key) return null;
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (update.autoEntryEnabled !== undefined) {
      sets.push(`auto_entry_enabled = $${idx++}`);
      params.push(Boolean(update.autoEntryEnabled));
    }
    if (update.entryTargetWeightPct !== undefined) {
      sets.push(`entry_target_weight_pct = $${idx++}`);
      params.push(update.entryTargetWeightPct == null ? null : Math.max(0, toFinite(update.entryTargetWeightPct)));
    }
    if (update.entryRules !== undefined) {
      sets.push(`entry_rules_json = $${idx++}`);
      params.push(update.entryRules == null ? null : JSON.stringify(update.entryRules));
    }
    if (update.entryCooldownDays !== undefined) {
      sets.push(`entry_cooldown_days = $${idx++}`);
      params.push(Math.max(1, Math.trunc(toFinite(update.entryCooldownDays, 14))));
    }

    if (sets.length === 0) {
      const existing = await query(
        `SELECT asset_key, auto_entry_enabled, entry_target_weight_pct,
                entry_rules_json, entry_cooldown_days, last_entry_triggered_at
         FROM daa_watchlist_entries WHERE owner_account_id = $1 AND asset_key = $2 LIMIT 1`,
        [ownerAccountId, key],
      );
      return existing.rows.length === 0 ? null : mapRow(existing.rows[0] as Record<string, unknown>);
    }

    sets.push("updated_at = NOW()");
    params.push(ownerAccountId, key);
    const result = await query(
      `UPDATE daa_watchlist_entries SET ${sets.join(", ")} WHERE owner_account_id = $${idx} AND asset_key = $${idx + 1}
       RETURNING asset_key, auto_entry_enabled, entry_target_weight_pct,
                 entry_rules_json, entry_cooldown_days, last_entry_triggered_at`,
      params,
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
  });
}

/** 标记一次触发（用于冷静期判断）。 */
export async function markWatchlistEntryTriggered(assetKey: string): Promise<void> {
  const key = normalizeText(assetKey).toUpperCase();
  if (!key) return;
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  await withDaaPgClient(async ({ query }) => {
    await query(
      `UPDATE daa_watchlist_entries
       SET last_entry_triggered_at = NOW(), updated_at = NOW()
       WHERE owner_account_id = $1 AND asset_key = $2`,
      [ownerAccountId, key],
    );
  });
}
