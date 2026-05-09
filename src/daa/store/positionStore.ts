/**
 * Position store functions.
 */

import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { buildDaaAssetKey } from "@/src/daa/assetKey";
import {
  withDaaPgClient,
  toIsoString,
  type DaaTxQueryFn,
} from "./storeShared";
import type { DaaStorePosition } from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";

function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAlias(value, fallback);
}

export function buildPositionKey(symbol: string, market: string): string {
  return buildDaaAssetKey(normalizeText(symbol).toUpperCase(), normalizeText(market, "US").toUpperCase());
}

export function buildPositionId(symbol: string, market: string): string {
  return `${normalizeText(symbol).toUpperCase()}__${normalizeText(market, "US").toUpperCase()}`;
}

type DaaPositionSnapshotRow = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis: number | null;
  costBasisInBase: number | null;
  tags: string[];
  updatedAt: string;
};

function normalizePositionSnapshotRow(row: Partial<DaaPositionSnapshotRow>): DaaPositionSnapshotRow | null {
  const symbol = normalizeText(row.symbol).toUpperCase();
  const market = normalizeText(row.market, "US").toUpperCase();
  if (!symbol) return null;
  return {
    assetKey: normalizeText(row.assetKey, buildPositionKey(symbol, market)).toUpperCase(),
    symbol,
    market,
    currency: normalizeCcyCode(row.currency, "USD"),
    qty: Math.max(0, toFiniteNumber(row.qty, 0)),
    price: Math.max(0, toFiniteNumber(row.price, 0)),
    costBasis: row.costBasis == null ? null : Math.max(0, toFiniteNumber(row.costBasis, 0)),
    costBasisInBase: row.costBasisInBase == null ? null : Math.max(0, toFiniteNumber(row.costBasisInBase, 0)),
    tags: Array.isArray(row.tags) ? row.tags.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean) : [],
    updatedAt: toIsoString(row.updatedAt, new Date().toISOString()),
  };
}

export async function replacePositionsV2SnapshotInTx(
  query: DaaTxQueryFn,
  rows: Array<Partial<DaaPositionSnapshotRow>>,
): Promise<void> {
  const ownerAccountId = getDaaAccountScopeId();
  await query("DELETE FROM daa_positions_v2 WHERE owner_account_id = $1", [ownerAccountId]);
  for (const raw of rows) {
    const row = normalizePositionSnapshotRow(raw);
    if (!row || !(row.qty > 0)) continue;
    await query(
      `INSERT INTO daa_positions_v2 (
         owner_account_id, asset_key, symbol, market, currency, qty, price, cost_basis, cost_basis_in_base, tags, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
       )`,
      [
        ownerAccountId,
        row.assetKey,
        row.symbol,
        row.market,
        row.currency,
        row.qty,
        row.price,
        row.costBasis,
        row.costBasisInBase,
        row.tags,
        row.updatedAt,
      ],
    );
  }
}

export async function syncSinglePositionV2InTx(
  query: DaaTxQueryFn,
  row: Partial<DaaPositionSnapshotRow>,
): Promise<void> {
  const ownerAccountId = getDaaAccountScopeId();
  const normalized = normalizePositionSnapshotRow(row);
  if (!normalized) return;
  if (!(normalized.qty > 0)) {
    await query("DELETE FROM daa_positions_v2 WHERE owner_account_id = $1 AND asset_key = $2", [ownerAccountId, normalized.assetKey]);
    return;
  }
  await query(
    `INSERT INTO daa_positions_v2 (
       owner_account_id, asset_key, symbol, market, currency, qty, price, cost_basis, cost_basis_in_base, tags, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
     )
     ON CONFLICT (owner_account_id, asset_key) DO UPDATE
     SET
       symbol = EXCLUDED.symbol,
       market = EXCLUDED.market,
       currency = EXCLUDED.currency,
       qty = EXCLUDED.qty,
       price = EXCLUDED.price,
       cost_basis = EXCLUDED.cost_basis,
       cost_basis_in_base = EXCLUDED.cost_basis_in_base,
       tags = EXCLUDED.tags,
       updated_at = EXCLUDED.updated_at`,
    [
      ownerAccountId,
      normalized.assetKey,
      normalized.symbol,
      normalized.market,
      normalized.currency,
      normalized.qty,
      normalized.price,
      normalized.costBasis,
      normalized.costBasisInBase,
      normalized.tags,
      normalized.updatedAt,
    ],
  );
}

export function mapPositionRow(row: Record<string, unknown>): DaaStorePosition {
  const symbol = normalizeText(row.symbol).toUpperCase();
  const market = normalizeText(row.market, "US").toUpperCase();
  return {
    id: buildPositionId(symbol, market),
    assetKey: buildPositionKey(symbol, market),
    symbol,
    market,
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    qty: toFiniteNumber(row.qty),
    price: toFiniteNumber(row.price),
    costBasis: row.cost_basis == null ? null : toFiniteNumber(row.cost_basis),
    costBasisInBase: row.cost_basis_in_base == null ? null : toFiniteNumber(row.cost_basis_in_base),
    tags: Array.isArray(row.tags) ? row.tags.map((x) => String(x)).filter(Boolean) : [],
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaPositions(): Promise<DaaStorePosition[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT asset_key, symbol, market, currency, qty, price, cost_basis, cost_basis_in_base, tags, updated_at FROM daa_positions_v2 WHERE owner_account_id = $1 AND qty > 0 ORDER BY symbol ASC, market ASC",
      [ownerAccountId],
    );
    return result.rows.map((row) => {
      const item = row as Record<string, unknown>;
      const symbol = normalizeText(item.symbol).toUpperCase();
      const market = normalizeText(item.market, "US").toUpperCase();
      return {
        id: buildPositionId(symbol, market),
        assetKey: buildPositionKey(symbol, market),
        symbol,
        market,
        currency: normalizeText(item.currency, "USD").toUpperCase(),
        qty: Math.max(0, toFiniteNumber(item.qty)),
        price: Math.max(0, toFiniteNumber(item.price)),
        costBasis: item.cost_basis == null ? null : Math.max(0, toFiniteNumber(item.cost_basis)),
        costBasisInBase: item.cost_basis_in_base == null ? null : toFiniteNumber(item.cost_basis_in_base),
        tags: Array.isArray(item.tags) ? item.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
        updatedAt: toIsoString(item.updated_at),
      } satisfies DaaStorePosition;
    });
  });
}
