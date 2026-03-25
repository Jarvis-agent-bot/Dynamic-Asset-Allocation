/**
 * Asset-universe store functions.
 */

import { normalizeText, toFinite, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { buildDaaAssetKey, parseDaaAssetKey } from "@/src/daa/assetKey";
import {
  inferMarketGroup, inferRegionByMarket,
  normalizeAssetClass, normalizeInstrumentType, normalizeRegion,
} from "@/src/daa/modules/workbench/assetTaxonomy";
import { withDaaPgClient, toIsoString, type DaaTxQueryFn } from "./storeShared";
import type { DaaStoreAssetUniverseRow } from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";
import { buildPositionKey, syncSinglePositionV2InTx } from "./positionStore";

function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAlias(value, fallback);
}

export function mapAssetUniverseRow(row: Record<string, unknown>): DaaStoreAssetUniverseRow {
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
    holdingTags: Array.isArray(row.holding_tags) ? row.holding_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    watchEnabled: Boolean(row.watch_enabled),
    targetWeightHint: Math.max(0, toFiniteNumber(row.target_weight_hint)),
    watchTags: Array.isArray(row.watch_tags) ? row.watch_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    notes: row.notes == null ? null : normalizeText(row.notes) || null,
    lastPrice: Math.max(0, toFiniteNumber(row.last_price)),
    priceUpdatedAt: row.price_updated_at == null ? null : toIsoString(row.price_updated_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export const ASSET_UNIVERSE_SELECT_COLUMNS_ = [
  "u.asset_key",
  "u.symbol",
  "u.market",
  "u.currency",
  "u.asset_class",
  "u.region",
  "u.exchange",
  "u.instrument_type",
  "u.market_group",
  "COALESCE(p.qty, 0) AS holding_qty",
  "COALESCE(p.price, 0) AS holding_price",
  "p.cost_basis",
  "COALESCE(p.tags, '{}'::TEXT[]) AS holding_tags",
  "u.watch_enabled",
  "u.target_weight_hint",
  "u.watch_tags",
  "u.notes",
  "u.last_price",
  "u.price_updated_at",
  "u.created_at",
  "u.updated_at",
].join(", ");

export const ASSET_UNIVERSE_FROM_SQL_ = "FROM daa_asset_universe u LEFT JOIN daa_positions_v2 p ON p.asset_key = u.asset_key";


export async function selectAssetUniverseRowByKeyInTx(
  query: DaaTxQueryFn,
  assetKey: string,
): Promise<DaaStoreAssetUniverseRow | null> {
  const result = await query(
    `SELECT ${ASSET_UNIVERSE_SELECT_COLUMNS_} ${ASSET_UNIVERSE_FROM_SQL_} WHERE u.asset_key = $1 LIMIT 1`,
    [assetKey],
  );
  if (!result.rows.length) return null;
  return mapAssetUniverseRow(result.rows[0] as Record<string, unknown>);
}

export async function listDaaAssetUniverse(): Promise<DaaStoreAssetUniverseRow[]> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(`SELECT ${ASSET_UNIVERSE_SELECT_COLUMNS_} ${ASSET_UNIVERSE_FROM_SQL_} ORDER BY u.symbol ASC, u.market ASC`);
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

    const result = await query(
      `UPDATE daa_asset_universe
       SET last_price = $2, price_updated_at = $3, updated_at = NOW()
       WHERE asset_key = $1
       RETURNING asset_key`,
      [assetKey, lastPrice, priceUpdatedAt],
    );
    if (!result.rows.length) return null;
    return selectAssetUniverseRowByKeyInTx(query as DaaTxQueryFn, assetKey);
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

    // 构建 VALUES 列表用于批量 UPDATE
    const params: (string | number)[] = [];
    const valuesClauses: string[] = [];
    for (let i = 0; i < validItems.length; i++) {
      const offset = i * 3;
      params.push(validItems[i].assetKey, validItems[i].lastPrice, validItems[i].priceUpdatedAt);
      valuesClauses.push(`($${offset + 1}, $${offset + 2}::numeric, $${offset + 3}::timestamptz)`);
    }

    const result = await query(
      `UPDATE daa_asset_universe AS u
       SET last_price = v.price, price_updated_at = v.updated_at, updated_at = NOW()
       FROM (VALUES ${valuesClauses.join(", ")}) AS v(asset_key, price, updated_at)
       WHERE u.asset_key = v.asset_key
       RETURNING u.asset_key`,
      params,
    );

    return result.rows.map((row: Record<string, unknown>) => String(row.asset_key || ""));
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

    const result = await query(
      `INSERT INTO daa_asset_universe (
        asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group,
        watch_enabled, target_weight_hint, watch_tags, notes, last_price, price_updated_at, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW()
      )
      ON CONFLICT (asset_key) DO UPDATE
      SET
        symbol = EXCLUDED.symbol,
        market = EXCLUDED.market,
        currency = EXCLUDED.currency,
        asset_class = EXCLUDED.asset_class,
        region = EXCLUDED.region,
        exchange = EXCLUDED.exchange,
        instrument_type = EXCLUDED.instrument_type,
        market_group = EXCLUDED.market_group,
        watch_enabled = EXCLUDED.watch_enabled,
        target_weight_hint = EXCLUDED.target_weight_hint,
        watch_tags = EXCLUDED.watch_tags,
        notes = EXCLUDED.notes,
        last_price = CASE WHEN EXCLUDED.last_price > 0 THEN EXCLUDED.last_price ELSE daa_asset_universe.last_price END,
        price_updated_at = CASE WHEN EXCLUDED.last_price > 0 THEN COALESCE(EXCLUDED.price_updated_at, NOW()) ELSE daa_asset_universe.price_updated_at END,
        updated_at = NOW()
      RETURNING asset_key`,
      [
        assetKey,
        symbol,
        market,
        currency,
        assetClass,
        region,
        exchange,
        instrumentType,
        marketGroup,
        watchEnabled,
        targetWeightHint,
        watchTags,
        notes,
        lastPrice,
        priceUpdatedAt,
      ],
    );
    return (await selectAssetUniverseRowByKeyInTx(query as DaaTxQueryFn, normalizeText(result.rows[0]?.asset_key, assetKey)))!;
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
    const parsed = parseDaaAssetKey(input.assetKey);
    if (!parsed) throw new Error("assetKey is required");
    const assetKey = buildPositionKey(parsed.symbol, parsed.market);
    const currentRes = await query(`SELECT ${ASSET_UNIVERSE_SELECT_COLUMNS_} ${ASSET_UNIVERSE_FROM_SQL_} WHERE u.asset_key = $1 LIMIT 1`, [assetKey]);
    if (!currentRes.rows.length) throw new Error(`asset not found: ${assetKey}`);
    const current = mapAssetUniverseRow(currentRes.rows[0] as Record<string, unknown>);

    const market = normalizeText(input.market, current.market).toUpperCase();
    const assetClass = normalizeAssetClass(input.assetClass, current.assetClass as any);
    const next = {
      symbol: current.symbol,
      market,
      currency: normalizeCcyCode(input.currency, current.currency),
      assetClass,
      region: normalizeRegion(input.region, current.region as any),
      exchange: normalizeText(input.exchange, current.exchange),
      instrumentType: normalizeInstrumentType(input.instrumentType, current.instrumentType as any),
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

    const updatedRes = await query(
      `UPDATE daa_asset_universe
       SET
         currency = $2,
         asset_class = $3,
         region = $4,
         exchange = $5,
         instrument_type = $6,
         market_group = $7,
         watch_enabled = $8,
         target_weight_hint = $9,
         holding_qty = $10,
         holding_price = $11,
         cost_basis = $12,
         watch_tags = $13,
         notes = $14,
         last_price = $15,
         price_updated_at = $16,
         updated_at = NOW()
       WHERE asset_key = $1
       RETURNING asset_key`,
      [
        assetKey,
        next.currency,
        next.assetClass,
        next.region,
        next.exchange,
        next.instrumentType,
        next.marketGroup,
        next.watchEnabled,
        next.targetWeightHint,
        next.holdingQty,
        next.holdingPrice,
        next.costBasis,
        next.watchTags,
        next.notes,
        next.lastPrice,
        next.priceUpdatedAt,
      ],
    );
    await syncSinglePositionV2InTx(query as DaaTxQueryFn, {
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
    return (await selectAssetUniverseRowByKeyInTx(query as DaaTxQueryFn, normalizeText(updatedRes.rows[0]?.asset_key, assetKey)))!;
  });
}

