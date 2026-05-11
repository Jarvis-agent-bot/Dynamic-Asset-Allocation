/**
 * 规范化表 CRUD — daa_asset_master / daa_watchlist_entries / daa_target_allocations / daa_market_price_snapshots
 *
 * 资产、观察、目标权重、价格快照分别落到独立表，避免宽表职责混杂。
 */

import { toFinite, type DaaTxQueryFn } from "./storeShared";
import { normalizeText } from "@/src/daa/utils/normalize";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import {
  inferMarketGroup, inferRegionByMarket,
  normalizeAssetClass, normalizeInstrumentType, normalizeRegion,
} from "@/src/daa/modules/workbench/assetTaxonomy";

// ── Asset Master ──

export async function upsertAssetMasterInTx(
  query: DaaTxQueryFn,
  input: {
    assetKey: string;
    symbol: string;
    name?: string | null;
    displayNameZh?: string | null;
    market: string;
    currency?: string;
    assetClass?: string;
    region?: string;
    exchange?: string;
    instrumentType?: string;
    marketGroup?: string;
  },
): Promise<void> {
  const market = normalizeText(input.market, "US").toUpperCase();
  const assetClass = normalizeAssetClass(input.assetClass, "EQUITY");
  const name = normalizeText(input.name) || null;
  const displayNameZh = normalizeText(input.displayNameZh) || null;
  await query(
    `INSERT INTO daa_asset_master (
      asset_key, symbol, name, display_name_zh, market, currency, asset_class, region, exchange, instrument_type, market_group, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
    ON CONFLICT (asset_key) DO UPDATE SET
      symbol = EXCLUDED.symbol,
      name = COALESCE(EXCLUDED.name, daa_asset_master.name),
      display_name_zh = COALESCE(EXCLUDED.display_name_zh, daa_asset_master.display_name_zh),
      market = EXCLUDED.market,
      currency = EXCLUDED.currency,
      asset_class = EXCLUDED.asset_class,
      region = EXCLUDED.region,
      exchange = EXCLUDED.exchange,
      instrument_type = EXCLUDED.instrument_type,
      market_group = EXCLUDED.market_group,
      updated_at = NOW()`,
    [
      input.assetKey,
      normalizeText(input.symbol).toUpperCase(),
      name,
      displayNameZh,
      market,
      normalizeCurrencyAlias(input.currency, "USD"),
      assetClass,
      normalizeRegion(input.region, inferRegionByMarket(market)),
      normalizeText(input.exchange, ""),
      normalizeInstrumentType(input.instrumentType, "STOCK"),
      normalizeText(input.marketGroup, inferMarketGroup({ market, assetClass })),
    ],
  );
}

// ── Watchlist ──

export async function upsertWatchlistEntryInTx(
  query: DaaTxQueryFn,
  input: {
    assetKey: string;
    watchEnabled: boolean;
    watchTags?: string[];
    notes?: string | null;
    priceAlertAbove?: number | null;
    priceAlertBelow?: number | null;
  },
): Promise<void> {
  const ownerAccountId = getDaaAccountScopeId();
  const tags = Array.isArray(input.watchTags)
    ? input.watchTags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
    : [];
  await query(
    `INSERT INTO daa_watchlist_entries (
      owner_account_id, asset_key, watch_enabled, watch_tags, notes, price_alert_above, price_alert_below, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
    ON CONFLICT (owner_account_id, asset_key) DO UPDATE SET
      watch_enabled = EXCLUDED.watch_enabled,
      watch_tags = EXCLUDED.watch_tags,
      notes = EXCLUDED.notes,
      price_alert_above = EXCLUDED.price_alert_above,
      price_alert_below = EXCLUDED.price_alert_below,
      updated_at = NOW()`,
    [
      ownerAccountId,
      input.assetKey,
      input.watchEnabled,
      tags,
      input.notes ?? null,
      input.priceAlertAbove ?? null,
      input.priceAlertBelow ?? null,
    ],
  );
}

/** 清理未关注且无持仓的 asset_master 行（级联删除 watchlist/target/price） */
export async function deleteOrphanedAssetsInTx(query: DaaTxQueryFn): Promise<void> {
  await query(`
    DELETE FROM daa_asset_master am
    WHERE NOT EXISTS (SELECT 1 FROM daa_positions_v2 p WHERE p.asset_key = am.asset_key AND p.qty > 0)
      AND NOT EXISTS (SELECT 1 FROM daa_watchlist_entries we WHERE we.asset_key = am.asset_key AND we.watch_enabled = TRUE)
  `);
}

// ── Target Allocation ──

export async function upsertTargetAllocationInTx(
  query: DaaTxQueryFn,
  assetKey: string,
  targetWeightHint: number,
): Promise<void> {
  const ownerAccountId = getDaaAccountScopeId();
  await query(
    `INSERT INTO daa_target_allocations (owner_account_id, asset_key, target_weight_hint, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (owner_account_id, asset_key) DO UPDATE SET
       target_weight_hint = EXCLUDED.target_weight_hint,
       updated_at = NOW()`,
    [ownerAccountId, assetKey, Math.max(0, toFinite(targetWeightHint))],
  );
}

// ── Market Price Snapshots ──

export async function updateMarketPriceSnapshotInTx(
  query: DaaTxQueryFn,
  assetKey: string,
  lastPrice: number,
  priceUpdatedAt: string,
): Promise<void> {
  await query(
    `INSERT INTO daa_market_price_snapshots (asset_key, last_price, price_updated_at, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (asset_key) DO UPDATE SET
       last_price = EXCLUDED.last_price,
       price_updated_at = EXCLUDED.price_updated_at,
       updated_at = NOW()`,
    [assetKey, Math.max(0, toFinite(lastPrice)), priceUpdatedAt],
  );
}
