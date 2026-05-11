/**
 * Asset-universe store functions.
 */

import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import {
  inferMarketGroup, inferRegionByMarket,
  normalizeAssetClass, normalizeInstrumentType, normalizeRegion,
  type AssetClass,
} from "@/src/daa/modules/workbench/assetTaxonomy";
import { withDaaPgClient, toIsoString, type DaaTxQueryFn } from "./storeShared";
import type { DaaStoreAssetUniverseRow } from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";
import { buildPositionKey, syncSinglePositionV2InTx } from "./positionStore";
import {
  upsertAssetMasterInTx, upsertWatchlistEntryInTx,
  upsertTargetAllocationInTx, updateMarketPriceSnapshotInTx,
} from "./assetMasterStore";

function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAlias(value, fallback);
}

function mapAssetUniverseRow(row: Record<string, unknown>): DaaStoreAssetUniverseRow {
  const symbol = normalizeText(row.symbol).toUpperCase();
  const market = normalizeText(row.market, "US").toUpperCase();
  const assetClass = normalizeAssetClass(row.asset_class, "EQUITY");
  const region = normalizeRegion(row.region, inferRegionByMarket(market));
  const instrumentType = normalizeInstrumentType(row.instrument_type, "STOCK");
  return {
    assetKey: buildPositionKey(symbol, market),
    symbol,
    market,
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    assetClass,
    region,
    exchange: normalizeText(row.exchange, ""),
    instrumentType,
    marketGroup: normalizeText(row.market_group, inferMarketGroup({ market, assetClass })),
    holdingQty: Math.max(0, toFiniteNumber(row.holding_qty)),
    holdingPrice: Math.max(0, toFiniteNumber(row.holding_price)),
    costBasis: row.cost_basis == null ? null : Math.max(0, toFiniteNumber(row.cost_basis)),
    costBasisInBase: row.cost_basis_in_base == null ? null : toFiniteNumber(row.cost_basis_in_base),
    holdingTags: Array.isArray(row.holding_tags) ? row.holding_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    watchEnabled: Boolean(row.watch_enabled),
    autoEntryEnabled: Boolean(row.auto_entry_enabled),
    entryTargetWeightPct: row.entry_target_weight_pct == null ? null : Math.max(0, toFiniteNumber(row.entry_target_weight_pct)),
    entryCooldownDays: Math.max(1, Math.trunc(toFiniteNumber(row.entry_cooldown_days, 14))),
    lastEntryTriggeredAt: row.last_entry_triggered_at == null ? null : toIsoString(row.last_entry_triggered_at),
    targetWeightHint: Math.max(0, toFiniteNumber(row.target_weight_hint)),
    watchTags: Array.isArray(row.watch_tags) ? row.watch_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    notes: row.notes == null ? null : normalizeText(row.notes) || null,
    priceAlertAbove: row.price_alert_above == null ? null : toFiniteNumber(row.price_alert_above),
    priceAlertBelow: row.price_alert_below == null ? null : toFiniteNumber(row.price_alert_below),
    lastPrice: Math.max(0, toFiniteNumber(row.last_price)),
    priceUpdatedAt: row.price_updated_at == null ? null : toIsoString(row.price_updated_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const ASSET_UNIVERSE_SELECT_COLUMNS_ = [
  "am.asset_key",
  "am.symbol",
  "am.market",
  "am.currency",
  "am.asset_class",
  "am.region",
  "am.exchange",
  "am.instrument_type",
  "am.market_group",
  "COALESCE(p.qty, 0) AS holding_qty",
  "COALESCE(p.price, 0) AS holding_price",
  "p.cost_basis",
  "p.cost_basis_in_base",
  "COALESCE(p.tags, '{}'::TEXT[]) AS holding_tags",
  "COALESCE(we.watch_enabled, FALSE) AS watch_enabled",
  "COALESCE(we.auto_entry_enabled, FALSE) AS auto_entry_enabled",
  "we.entry_target_weight_pct",
  "COALESCE(we.entry_cooldown_days, 14) AS entry_cooldown_days",
  "we.last_entry_triggered_at",
  "COALESCE(ta.target_weight_hint, 0) AS target_weight_hint",
  "COALESCE(we.watch_tags, '{}'::TEXT[]) AS watch_tags",
  "we.notes",
  "we.price_alert_above",
  "we.price_alert_below",
  "COALESCE(mps.last_price, 0) AS last_price",
  "mps.price_updated_at",
  "am.created_at",
  "am.updated_at",
].join(", ");

const ASSET_UNIVERSE_FROM_SQL_ = [
  "FROM daa_asset_master am",
  "LEFT JOIN daa_positions_v2 p ON p.owner_account_id = $1 AND p.asset_key = am.asset_key",
  "LEFT JOIN daa_watchlist_entries we ON we.owner_account_id = $1 AND we.asset_key = am.asset_key",
  "LEFT JOIN daa_target_allocations ta ON ta.owner_account_id = $1 AND ta.asset_key = am.asset_key",
  "LEFT JOIN daa_market_price_snapshots mps ON mps.asset_key = am.asset_key",
].join(" ");


async function selectAssetUniverseRowByKeyInTx(
  query: DaaTxQueryFn,
  assetKey: string,
): Promise<DaaStoreAssetUniverseRow | null> {
  const ownerAccountId = getDaaAccountScopeId();
  const result = await query(
    `SELECT ${ASSET_UNIVERSE_SELECT_COLUMNS_} ${ASSET_UNIVERSE_FROM_SQL_} WHERE am.asset_key = $2 LIMIT 1`,
    [ownerAccountId, assetKey],
  );
  if (!result.rows.length) return null;
  return mapAssetUniverseRow(result.rows[0] as Record<string, unknown>);
}

export async function listDaaAssetUniverse(): Promise<DaaStoreAssetUniverseRow[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT ${ASSET_UNIVERSE_SELECT_COLUMNS_} ${ASSET_UNIVERSE_FROM_SQL_}
       WHERE COALESCE(p.qty, 0) > 0 OR COALESCE(we.watch_enabled, FALSE) = TRUE OR COALESCE(ta.target_weight_hint, 0) > 0
       ORDER BY am.symbol ASC, am.market ASC`,
      [ownerAccountId],
    );
    return result.rows.map((row) => mapAssetUniverseRow(row as Record<string, unknown>));
  });
}

export async function updateDaaAssetUniverseLastPrice(input: {
  assetKey: string;
  lastPrice: number;
  priceUpdatedAt?: string;
}): Promise<DaaStoreAssetUniverseRow | null> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const assetKey = normalizeText(input.assetKey).toUpperCase();
    const lastPrice = Math.max(0, toFiniteNumber(input.lastPrice));
    if (!assetKey) throw new Error("assetKey is required");
    if (!(lastPrice > 0)) throw new Error("lastPrice must be > 0");
    const priceUpdatedAt = toIsoString(input.priceUpdatedAt, new Date().toISOString());

    await updateMarketPriceSnapshotInTx(query, assetKey, lastPrice, priceUpdatedAt);
    return selectAssetUniverseRowByKeyInTx(query, assetKey);
  });
}

/**
 * 批量更新资产最新价格 — 单次事务替代 N 次独立连接。
 * 性能优化：将 N+1 查询模式改为单次批量 UPDATE。
 */
export async function batchUpdateDaaAssetUniverseLastPrices(
  items: Array<{ assetKey: string; lastPrice: number; priceUpdatedAt: string }>,
): Promise<string[]> {
  if (items.length === 0) return [];
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const validItems = items
      .map((item) => ({
        assetKey: normalizeText(item.assetKey).toUpperCase(),
        lastPrice: Math.max(0, toFiniteNumber(item.lastPrice)),
        priceUpdatedAt: toIsoString(item.priceUpdatedAt, new Date().toISOString()),
      }))
      .filter((item) => item.assetKey && item.lastPrice > 0);

    if (validItems.length === 0) return [];

    const params: (string | number)[] = [];
    const valuesClauses: string[] = [];
    for (let i = 0; i < validItems.length; i++) {
      const offset = i * 3;
      params.push(validItems[i].assetKey, validItems[i].lastPrice, validItems[i].priceUpdatedAt);
      valuesClauses.push(`($${offset + 1}, $${offset + 2}::numeric, $${offset + 3}::timestamptz)`);
    }

    const result = await query(
      `INSERT INTO daa_market_price_snapshots AS mps (asset_key, last_price, price_updated_at)
       VALUES ${valuesClauses.join(", ")}
       ON CONFLICT (asset_key) DO UPDATE SET
         last_price = EXCLUDED.last_price,
         price_updated_at = EXCLUDED.price_updated_at,
         updated_at = NOW()
       RETURNING mps.asset_key`,
      params,
    );

    return result.rows.map((row: Record<string, unknown>) => String(row.asset_key || ""));
  });
}

/** SSE 用：批量读取资产价格快照（单次查询，高频安全） */
export type AssetPriceSnapshot = {
  assetKey: string;
  symbol: string;
  lastPrice: number;
  priceUpdatedAt: string;
  currency: string;
};

export async function batchReadAssetPriceSnapshots(
  assetKeys: string[],
): Promise<AssetPriceSnapshot[]> {
  if (assetKeys.length === 0) return [];
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const params = assetKeys.map((k) => normalizeText(k).toUpperCase()).filter(Boolean);
    if (params.length === 0) return [];
    const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
    const result = await query(
      `SELECT am.asset_key, am.symbol, mps.last_price, mps.price_updated_at, am.currency
       FROM daa_asset_master am
       JOIN daa_market_price_snapshots mps ON mps.asset_key = am.asset_key
       WHERE am.asset_key IN (${placeholders})
         AND mps.last_price IS NOT NULL AND mps.last_price > 0`,
      params,
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      assetKey: String(row.asset_key || ""),
      symbol: String(row.symbol || ""),
      lastPrice: toFiniteNumber(row.last_price),
      priceUpdatedAt: String(row.price_updated_at || ""),
      currency: String(row.currency || "USD"),
    }));
  });
}

export async function upsertDaaAssetUniverseRow(input: {
  symbol: string;
  market?: string;
  currency?: string;
  assetClass?: string;
  region?: string;
  exchange?: string;
  instrumentType?: string;
  marketGroup?: string;
  watchEnabled?: boolean;
  targetWeightHint?: number;
  watchTags?: string[];
  notes?: string | null;
  lastPrice?: number;
  priceUpdatedAt?: string | null;
}): Promise<DaaStoreAssetUniverseRow> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const symbol = normalizeText(input.symbol).toUpperCase();
    const market = normalizeText(input.market, "US").toUpperCase();
    if (!symbol) throw new Error("symbol is required");
    const assetKey = buildPositionKey(symbol, market);
    const currency = normalizeCcyCode(input.currency, "USD");
    const assetClass = normalizeAssetClass(input.assetClass, "EQUITY");
    const region = normalizeRegion(input.region, inferRegionByMarket(market));
    const exchange = normalizeText(input.exchange, "");
    const instrumentType = normalizeInstrumentType(input.instrumentType, "STOCK");
    const marketGroup = normalizeText(input.marketGroup, inferMarketGroup({ market, assetClass }));
    const watchEnabled = input.watchEnabled !== false;
    const targetWeightHint = Math.max(0, toFiniteNumber(input.targetWeightHint));
    const watchTags = Array.isArray(input.watchTags) ? input.watchTags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [];
    const notes = input.notes == null ? null : normalizeText(input.notes) || null;
    const lastPrice = Math.max(0, toFiniteNumber(input.lastPrice));
    const priceUpdatedAt = lastPrice > 0 ? toIsoString(input.priceUpdatedAt, new Date().toISOString()) : null;

    const txQuery = query;
    await upsertAssetMasterInTx(txQuery, {
      assetKey, symbol, market, currency, assetClass, region, exchange, instrumentType, marketGroup,
    });
    await upsertWatchlistEntryInTx(txQuery, {
      assetKey, watchEnabled, watchTags, notes,
    });
    await upsertTargetAllocationInTx(txQuery, assetKey, targetWeightHint);
    if (lastPrice > 0) {
      await updateMarketPriceSnapshotInTx(txQuery, assetKey, lastPrice, priceUpdatedAt || new Date().toISOString());
    }
    return (await selectAssetUniverseRowByKeyInTx(txQuery, assetKey))!;
  });
}

export async function patchDaaAssetUniverseRow(input: {
  assetKey: string;
  market?: string;
  currency?: string;
  assetClass?: string;
  region?: string;
  exchange?: string;
  instrumentType?: string;
  marketGroup?: string;
  watchEnabled?: boolean;
  targetWeightHint?: number;
  holdingQty?: number;
  holdingPrice?: number;
  costBasis?: number | null;
  watchTags?: string[];
  notes?: string | null;
  lastPrice?: number;
  priceUpdatedAt?: string | null;
}): Promise<DaaStoreAssetUniverseRow> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const ownerAccountId = getDaaAccountScopeId();
    const parsed = parseDaaAssetKey(input.assetKey);
    if (!parsed) throw new Error("assetKey is required");
    const assetKey = buildPositionKey(parsed.symbol, parsed.market);

    const txQuery = query;
    await txQuery("BEGIN");
    try {
      const currentRes = await txQuery(`SELECT ${ASSET_UNIVERSE_SELECT_COLUMNS_} ${ASSET_UNIVERSE_FROM_SQL_} WHERE am.asset_key = $2 LIMIT 1`, [ownerAccountId, assetKey]);
      if (!currentRes.rows.length) throw new Error(`asset not found: ${assetKey}`);
      const current = mapAssetUniverseRow(currentRes.rows[0] as Record<string, unknown>);

      const market = normalizeText(input.market, current.market).toUpperCase();
      const currentAssetClass = normalizeAssetClass(current.assetClass, "EQUITY");
      const currentRegion = normalizeRegion(current.region, inferRegionByMarket(market));
      const currentInstrumentType = normalizeInstrumentType(current.instrumentType, "STOCK");
      const assetClass: AssetClass = normalizeAssetClass(input.assetClass, currentAssetClass);
      const next = {
        symbol: current.symbol,
        market,
        currency: normalizeCcyCode(input.currency, current.currency),
        assetClass,
        region: normalizeRegion(input.region, currentRegion),
        exchange: normalizeText(input.exchange, current.exchange),
        instrumentType: normalizeInstrumentType(input.instrumentType, currentInstrumentType),
        marketGroup: normalizeText(input.marketGroup, current.marketGroup || inferMarketGroup({ market, assetClass })),
        watchEnabled: input.watchEnabled == null ? current.watchEnabled : Boolean(input.watchEnabled),
        targetWeightHint: input.targetWeightHint == null ? current.targetWeightHint : Math.max(0, toFiniteNumber(input.targetWeightHint)),
        holdingQty: input.holdingQty == null ? current.holdingQty : Math.max(0, toFiniteNumber(input.holdingQty)),
        holdingPrice: input.holdingPrice == null ? current.holdingPrice : Math.max(0, toFiniteNumber(input.holdingPrice)),
        costBasis: input.costBasis === undefined ? current.costBasis : (input.costBasis == null ? null : Math.max(0, toFiniteNumber(input.costBasis))),
        watchTags: input.watchTags == null ? current.watchTags : input.watchTags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean),
        notes: input.notes === undefined ? current.notes : (input.notes == null ? null : normalizeText(input.notes) || null),
        lastPrice: input.lastPrice == null ? current.lastPrice : Math.max(0, toFiniteNumber(input.lastPrice)),
        priceUpdatedAt: input.priceUpdatedAt === undefined ? current.priceUpdatedAt : (input.priceUpdatedAt ? toIsoString(input.priceUpdatedAt, new Date().toISOString()) : null),
      };

      // 写入规范化表
      await upsertAssetMasterInTx(txQuery, {
        assetKey, symbol: next.symbol, market: next.market, currency: next.currency,
        assetClass: next.assetClass, region: next.region, exchange: next.exchange,
        instrumentType: next.instrumentType, marketGroup: next.marketGroup,
      });
      await upsertWatchlistEntryInTx(txQuery, {
        assetKey, watchEnabled: next.watchEnabled, watchTags: next.watchTags, notes: next.notes,
      });
      await upsertTargetAllocationInTx(txQuery, assetKey, next.targetWeightHint);
      if (next.lastPrice > 0 && next.priceUpdatedAt) {
        await updateMarketPriceSnapshotInTx(txQuery, assetKey, next.lastPrice, next.priceUpdatedAt);
      }
      await syncSinglePositionV2InTx(txQuery, {
        assetKey,
        symbol: current.symbol,
        market: current.market,
        currency: next.currency,
        qty: next.holdingQty,
        price: next.holdingPrice,
        costBasis: next.costBasis,
        tags: current.holdingTags,
        updatedAt: new Date().toISOString(),
      });
      const row = await selectAssetUniverseRowByKeyInTx(txQuery, assetKey);
      if (!row) throw new Error(`patch succeeded but row not found: ${assetKey}`);
      await txQuery("COMMIT");
      return row;
    } catch (err) {
      await query("ROLLBACK").catch(() => {});
      throw err;
    }
  });
}
