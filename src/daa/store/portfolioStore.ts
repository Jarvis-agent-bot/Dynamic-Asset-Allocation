/**
 * Portfolio store functions.
 */

import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { buildFxLookupToBase, summarizeMarkToMarketPortfolio } from "@/src/daa/modules/portfolio/portfolioValuation";
import { withDaaPgClient, parseJsonb, toIsoString, type DaaTxQueryFn } from "./storeShared";
import type { DaaStoreEquitySnapshot, DaaStoreHumanIngestState, DaaStoreCandidateAsset } from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";
import { buildPositionKey } from "./positionStore";
import {
  upsertAssetMasterInTx, upsertWatchlistEntryInTx,
  upsertTargetAllocationInTx, deleteOrphanedAssetsInTx,
} from "./assetMasterStore";
import { ensureAccountStateRowInTx } from "./accountStore";
import { recordTargetWeightAuditInTx } from "./targetWeightAuditStore";

function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAlias(value, fallback);
}

function mapEquitySnapshotRow(row: Record<string, unknown>): DaaStoreEquitySnapshot {
  return {
    ts: toIsoString(row.ts),
    totalEquity: toFiniteNumber(row.total_equity),
    holdingsValue: toFiniteNumber(row.holdings_value),
    cash: toFiniteNumber(row.cash),
    source: normalizeText(row.source, "cron"),
  };
}

export async function listDaaEquitySnapshots(limit = 200): Promise<DaaStoreEquitySnapshot[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const n = Math.max(1, Math.min(2000, Math.trunc(toFiniteNumber(limit, 200))));
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT ts, total_equity, holdings_value, cash, source FROM daa_equity_snapshots_v2 WHERE owner_account_id = $1 ORDER BY ts DESC LIMIT $2",
      [ownerAccountId, n],
    );
    return result.rows.map((row) => mapEquitySnapshotRow(row as Record<string, unknown>));
  });
}

export async function appendDaaEquitySnapshot(snapshot: Partial<DaaStoreEquitySnapshot>): Promise<DaaStoreEquitySnapshot> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const ts = toIsoString(snapshot.ts, new Date().toISOString());
    const totalEquity = Math.max(0, toFiniteNumber(snapshot.totalEquity));
    const holdingsValue = Math.max(0, toFiniteNumber(snapshot.holdingsValue));
    const cash = Math.max(0, toFiniteNumber(snapshot.cash));
    const source = normalizeText(snapshot.source, "manual");

    await query(
      "INSERT INTO daa_equity_snapshots_v2 (owner_account_id, ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (owner_account_id, ts) DO UPDATE SET total_equity=EXCLUDED.total_equity, holdings_value=EXCLUDED.holdings_value, cash=EXCLUDED.cash, source=EXCLUDED.source",
      [ownerAccountId, ts, totalEquity, holdingsValue, cash, source],
    );

    const result = await query(
      "SELECT ts, total_equity, holdings_value, cash, source FROM daa_equity_snapshots_v2 WHERE owner_account_id = $1 AND ts = $2 LIMIT 1",
      [ownerAccountId, ts],
    );
    return mapEquitySnapshotRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function appendCurrentDaaEquitySnapshot(input: {
  ts?: string;
  source?: string;
} = {}): Promise<DaaStoreEquitySnapshot> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      const account = await ensureAccountStateRowInTx(query);
      const valuation = await buildPortfolioSnapshotFromAssetUniverseInTx(query, {
        baseCurrency: account.baseCurrency,
        cash: account.cash,
      });
      const ts = toIsoString(input.ts, new Date().toISOString());
      const source = normalizeText(input.source, "market_price_refresh");

      await query(
        "UPDATE daa_account_state_v2 SET total_equity = $1::numeric, updated_at = NOW() WHERE id = $2",
        [valuation.totalEquity, ownerAccountId],
      );
      await query(
        "INSERT INTO daa_equity_snapshots_v2 (owner_account_id, ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (owner_account_id, ts) DO UPDATE SET total_equity=EXCLUDED.total_equity, holdings_value=EXCLUDED.holdings_value, cash=EXCLUDED.cash, source=EXCLUDED.source",
        [ownerAccountId, ts, valuation.totalEquity, valuation.holdingsValue, account.cash, source],
      );

      await query("COMMIT");
      return {
        ts,
        totalEquity: valuation.totalEquity,
        holdingsValue: valuation.holdingsValue,
        cash: account.cash,
        source,
      };
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (rollbackError) {
        logSwallowed("portfolioStore.appendCurrentSnapshot.rollback", rollbackError);
      }
      throw error;
    }
  });
}

function mapHumanIngestStateRow(row: Record<string, unknown>): DaaStoreHumanIngestState {
  return {
    id: "default",
    lastIngestAt: row.last_ingest_at == null ? null : toIsoString(row.last_ingest_at, new Date().toISOString()),
    ingestCount: Math.max(0, Math.trunc(toFiniteNumber(row.ingest_count, 0))),
    latestBatch: parseJsonb<Record<string, unknown> | null>(row.latest_batch_json, null),
    latestActors: parseJsonb<Array<Record<string, unknown>>>(row.latest_actors_json, []),
    latestHoldings: parseJsonb<Array<Record<string, unknown>>>(row.latest_holdings_json, []),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function getDaaHumanIngestState(): Promise<DaaStoreHumanIngestState | null> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT id, last_ingest_at, ingest_count, latest_batch_json, latest_actors_json, latest_holdings_json, updated_at FROM daa_hf_ingest_state WHERE id = 'default' LIMIT 1",
    );
    if (!result.rows.length) return null;
    return mapHumanIngestStateRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function saveDaaHumanIngestState(input: {
  lastIngestAt?: string | null;
  ingestCount?: number;
  latestBatch?: Record<string, unknown> | null;
  latestActors?: Array<Record<string, unknown>>;
  latestHoldings?: Array<Record<string, unknown>>;
}): Promise<DaaStoreHumanIngestState> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const lastIngestAt = input.lastIngestAt ? toIsoString(input.lastIngestAt, new Date().toISOString()) : null;
    const ingestCount = Math.max(0, Math.trunc(toFiniteNumber(input.ingestCount, 0)));
    const latestBatch = input.latestBatch && typeof input.latestBatch === "object" ? input.latestBatch : null;
    const latestActors = Array.isArray(input.latestActors) ? input.latestActors : [];
    const latestHoldings = Array.isArray(input.latestHoldings) ? input.latestHoldings : [];

    await query(
      "INSERT INTO daa_hf_ingest_state (id, last_ingest_at, ingest_count, latest_batch_json, latest_actors_json, latest_holdings_json, updated_at) VALUES ('default',$1,$2,$3,$4,$5,NOW()) ON CONFLICT (id) DO UPDATE SET last_ingest_at = EXCLUDED.last_ingest_at, ingest_count = EXCLUDED.ingest_count, latest_batch_json = EXCLUDED.latest_batch_json, latest_actors_json = EXCLUDED.latest_actors_json, latest_holdings_json = EXCLUDED.latest_holdings_json, updated_at = NOW()",
      [lastIngestAt, ingestCount, JSON.stringify(latestBatch), JSON.stringify(latestActors), JSON.stringify(latestHoldings)],
    );

    const result = await query(
      "SELECT id, last_ingest_at, ingest_count, latest_batch_json, latest_actors_json, latest_holdings_json, updated_at FROM daa_hf_ingest_state WHERE id = 'default' LIMIT 1",
    );
    return mapHumanIngestStateRow(result.rows[0] as Record<string, unknown>);
  });
}

function mapCandidateAssetRow(row: Record<string, unknown>): DaaStoreCandidateAsset {
  return {
    id: normalizeText(row.id),
    symbol: normalizeText(row.symbol).toUpperCase(),
    market: normalizeText(row.market, "US").toUpperCase(),
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    enabled: Boolean(row.enabled),
    targetWeightHint: Math.max(0, toFiniteNumber(row.target_weight_hint)),
    tags: Array.isArray(row.tags) ? row.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    notes: row.notes == null ? null : normalizeText(row.notes) || null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaCandidateAssets(): Promise<DaaStoreCandidateAsset[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT am.asset_key, am.symbol, am.market, am.currency,
              we.watch_enabled, COALESCE(ta.target_weight_hint, 0) AS target_weight_hint,
              we.watch_tags, we.notes, am.created_at, am.updated_at
       FROM daa_asset_master am
       JOIN daa_watchlist_entries we ON we.owner_account_id = $1 AND we.asset_key = am.asset_key
       LEFT JOIN daa_target_allocations ta ON ta.owner_account_id = $1 AND ta.asset_key = am.asset_key
       WHERE we.watch_enabled = TRUE
       ORDER BY am.symbol ASC, am.market ASC`,
      [ownerAccountId],
    );
    return result.rows.map((row) => {
      const item = row as Record<string, unknown>;
      return mapCandidateAssetRow({
        id: item.asset_key,
        symbol: item.symbol,
        market: item.market,
        currency: item.currency,
        enabled: item.watch_enabled,
        target_weight_hint: item.target_weight_hint,
        tags: item.watch_tags,
        notes: item.notes,
        created_at: item.created_at,
        updated_at: item.updated_at,
      });
    });
  });
}

export async function replaceDaaCandidateAssets(
  rows: Array<Partial<DaaStoreCandidateAsset>>,
): Promise<DaaStoreCandidateAsset[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const txQuery = query;
    await txQuery("BEGIN");
    try {
      const currentTargetRows = await txQuery(
        "SELECT asset_key, target_weight_hint FROM daa_target_allocations WHERE owner_account_id = $1",
        [ownerAccountId],
      );
      const previousTargets = new Map(
        currentTargetRows.rows.map((row) => [
          normalizeText((row as Record<string, unknown>).asset_key).toUpperCase(),
          Math.max(0, toFiniteNumber((row as Record<string, unknown>).target_weight_hint)),
        ] as const),
      );
      const desiredTargets = new Map<string, { symbol: string; targetWeightHint: number }>();

      // 清除所有观察列表标记
      await txQuery(
        "UPDATE daa_watchlist_entries SET watch_enabled = FALSE, watch_tags = '{}'::TEXT[], notes = NULL, updated_at = NOW() WHERE owner_account_id = $1",
        [ownerAccountId],
      );
      await txQuery(
        "UPDATE daa_target_allocations SET target_weight_hint = 0, updated_at = NOW() WHERE owner_account_id = $1",
        [ownerAccountId],
      );
      for (const raw of rows) {
        const symbol = normalizeText(raw.symbol).toUpperCase();
        if (!symbol) continue;
        const market = normalizeText(raw.market, "US").toUpperCase();
        const currency = normalizeText(raw.currency, "USD").toUpperCase();
        const assetKey = buildPositionKey(symbol, market);
        const enabled = raw.enabled !== false;
        const targetWeightHint = Math.max(0, toFiniteNumber(raw.targetWeightHint));
        const tags = Array.isArray(raw.tags) ? raw.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [];
        const notes = normalizeText(raw.notes || "");

        await upsertAssetMasterInTx(txQuery, { assetKey, symbol, market, currency });
        await upsertWatchlistEntryInTx(txQuery, {
          assetKey, watchEnabled: enabled, watchTags: tags, notes: notes || null,
        });
        await upsertTargetAllocationInTx(txQuery, assetKey, targetWeightHint);
        desiredTargets.set(assetKey.toUpperCase(), { symbol, targetWeightHint });
      }

      const auditKeys = new Set([...previousTargets.keys(), ...desiredTargets.keys()]);
      for (const assetKey of auditKeys) {
        const desired = desiredTargets.get(assetKey);
        const previous = previousTargets.has(assetKey) ? previousTargets.get(assetKey)! : null;
        const next = desired?.targetWeightHint ?? 0;
        await recordTargetWeightAuditInTx(txQuery, {
          assetKey,
          symbol: desired?.symbol ?? assetKey.split("::").pop() ?? assetKey,
          previousTargetWeightHint: previous,
          nextTargetWeightHint: next,
          source: "candidate_assets_replace",
          reason: desired
            ? "候选资产列表替换设置目标权重"
            : "候选资产列表替换清零目标权重",
          actor: "candidate_assets_route",
          payload: {
            operation: desired ? "replace_set" : "replace_clear",
          },
        });
      }
      // 清理无持仓且未关注的孤儿资产
      await deleteOrphanedAssetsInTx(txQuery);
      await txQuery("COMMIT");
    } catch (error) {
      try {
        await txQuery("ROLLBACK");
      } catch (err) {
        logSwallowed("portfolioStore.rollback", err);
      }
      throw error;
    }

    const result = await query(
      `SELECT am.asset_key, am.symbol, am.market, am.currency,
              we.watch_enabled, COALESCE(ta.target_weight_hint, 0) AS target_weight_hint,
              we.watch_tags, we.notes, am.created_at, am.updated_at
       FROM daa_asset_master am
       JOIN daa_watchlist_entries we ON we.owner_account_id = $1 AND we.asset_key = am.asset_key
       LEFT JOIN daa_target_allocations ta ON ta.owner_account_id = $1 AND ta.asset_key = am.asset_key
       WHERE we.watch_enabled = TRUE
       ORDER BY am.symbol ASC, am.market ASC`,
      [ownerAccountId],
    );
    return result.rows.map((row) => {
      const item = row as Record<string, unknown>;
      return mapCandidateAssetRow({
        id: item.asset_key,
        symbol: item.symbol,
        market: item.market,
        currency: item.currency,
        enabled: item.watch_enabled,
        target_weight_hint: item.target_weight_hint,
        tags: item.watch_tags,
        notes: item.notes,
        created_at: item.created_at,
        updated_at: item.updated_at,
      });
    });
  });
}

export async function buildPortfolioSnapshotFromAssetUniverseInTx(
  query: DaaTxQueryFn,
  input: { baseCurrency: string; cash: number },
): Promise<{ holdingsValue: number; totalEquity: number }> {
  const ownerAccountId = getDaaAccountScopeId();
  const [holdingsRes, fxRes] = await Promise.all([
    query(`
      SELECT
        p.symbol,
        p.market,
        p.currency,
        p.qty AS holding_qty,
        p.price AS holding_price,
        COALESCE(mps.last_price, p.price, 0) AS last_price
      FROM daa_positions_v2 p
      LEFT JOIN daa_market_price_snapshots mps ON mps.asset_key = p.asset_key
      WHERE p.owner_account_id = $1 AND p.qty > 0
    `, [ownerAccountId]),
    query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates"),
  ]);
  const summary = summarizeMarkToMarketPortfolio({
    positions: holdingsRes.rows.map((row) => ({
      symbol: normalizeText(row.symbol).toUpperCase(),
      market: normalizeText(row.market, "US").toUpperCase(),
      currency: normalizeCcyCode(row.currency, input.baseCurrency),
      qty: Math.max(0, toFiniteNumber(row.holding_qty, 0)),
      holdingPrice: Math.max(0, toFiniteNumber(row.holding_price, 0)),
      lastPrice: Math.max(0, toFiniteNumber(row.last_price, 0)),
    })),
    baseCurrency: input.baseCurrency,
    cash: input.cash,
    fxLookup: buildFxLookupToBase((fxRes.rows as Array<Record<string, unknown>>).map((row) => ({
      baseCcy: row.base_ccy,
      quoteCcy: row.quote_ccy,
      rate: row.rate,
    }))),
  });
  return {
    holdingsValue: summary.holdingsValue,
    totalEquity: summary.totalEquity,
  };
}
