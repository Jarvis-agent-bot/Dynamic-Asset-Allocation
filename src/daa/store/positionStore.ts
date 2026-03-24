/**
 * Position store functions.
 */

import { normalizeText, toFinite, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { buildDaaAssetKey } from "@/src/daa/assetKey";
import {
  withDaaPgClient,
  toIsoString,
  type DaaTxQueryFn,
} from "./storeShared";
import type { DaaStorePosition, DaaStoreBrokerKind } from "./storeTypes";
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

export type DaaPositionSnapshotRow = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis: number | null;
  tags: string[];
  updatedAt: string;
};

export function normalizePositionSnapshotRow(row: Partial<DaaPositionSnapshotRow>): DaaPositionSnapshotRow | null {
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
    tags: Array.isArray(row.tags) ? row.tags.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean) : [],
    updatedAt: toIsoString(row.updatedAt, new Date().toISOString()),
  };
}

export async function replacePositionsV2SnapshotInTx(
  query: DaaTxQueryFn,
  rows: Array<Partial<DaaPositionSnapshotRow>>,
): Promise<void> {
  await query("DELETE FROM daa_positions_v2");
  for (const raw of rows) {
    const row = normalizePositionSnapshotRow(raw);
    if (!row || !(row.qty > 0)) continue;
    await query(
      `INSERT INTO daa_positions_v2 (
         asset_key, symbol, market, currency, qty, price, cost_basis, tags, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9
       )`,
      [
        row.assetKey,
        row.symbol,
        row.market,
        row.currency,
        row.qty,
        row.price,
        row.costBasis,
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
  const normalized = normalizePositionSnapshotRow(row);
  if (!normalized) return;
  if (!(normalized.qty > 0)) {
    await query("DELETE FROM daa_positions_v2 WHERE asset_key = $1", [normalized.assetKey]);
    return;
  }
  await query(
    `INSERT INTO daa_positions_v2 (
       asset_key, symbol, market, currency, qty, price, cost_basis, tags, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9
     )
     ON CONFLICT (asset_key) DO UPDATE
     SET
       symbol = EXCLUDED.symbol,
       market = EXCLUDED.market,
       currency = EXCLUDED.currency,
       qty = EXCLUDED.qty,
       price = EXCLUDED.price,
       cost_basis = EXCLUDED.cost_basis,
       tags = EXCLUDED.tags,
       updated_at = EXCLUDED.updated_at`,
    [
      normalized.assetKey,
      normalized.symbol,
      normalized.market,
      normalized.currency,
      normalized.qty,
      normalized.price,
      normalized.costBasis,
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
    tags: Array.isArray(row.tags) ? row.tags.map((x) => String(x)).filter(Boolean) : [],
    updatedAt: toIsoString(row.updated_at),
  };
}

export function mapBrokerPositionRow(row: Record<string, unknown>): DaaStorePosition {
  const symbol = normalizeText(row.symbol).toUpperCase();
  const market = normalizeText(row.market, "US").toUpperCase();
  return {
    id: buildPositionId(symbol, market),
    assetKey: buildPositionKey(symbol, market),
    symbol,
    market,
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    qty: Math.max(0, toFiniteNumber(row.qty)),
    price: Math.max(0, toFiniteNumber(row.price)),
    costBasis: row.cost_basis == null ? null : Math.max(0, toFiniteNumber(row.cost_basis)),
    tags: Array.isArray(row.tags) ? row.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaPositions(): Promise<DaaStorePosition[]> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT asset_key, symbol, market, currency, qty, price, cost_basis, tags, updated_at FROM daa_positions_v2 WHERE qty > 0 ORDER BY symbol ASC, market ASC",
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
        tags: Array.isArray(item.tags) ? item.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
        updatedAt: toIsoString(item.updated_at),
      } satisfies DaaStorePosition;
    });
  });
}

export async function replaceDaaPositions(rows: Array<Partial<DaaStorePosition>>): Promise<DaaStorePosition[]> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      await query(
        "UPDATE daa_asset_universe SET holding_qty = 0, holding_price = 0, cost_basis = NULL, holding_tags = '{}'::TEXT[], updated_at = NOW()",
      );
      for (const raw of rows) {
        const symbol = normalizeText(raw.symbol).toUpperCase();
        if (!symbol) continue;
        const market = normalizeText(raw.market, "US").toUpperCase();
        const assetKey = buildPositionKey(symbol, market);
        const currency = normalizeText(raw.currency, "USD").toUpperCase();
        const qty = Math.max(0, toFiniteNumber(raw.qty));
        const price = Math.max(0, toFiniteNumber(raw.price));
        const lastPrice = price > 0 ? price : 0;
        const priceUpdatedAt = price > 0 ? new Date().toISOString() : null;
        const costBasis = raw.costBasis == null ? null : Math.max(0, toFiniteNumber(raw.costBasis));
        const tags = Array.isArray(raw.tags)
          ? raw.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
          : [];

        await query(
          `
            INSERT INTO daa_asset_universe (
              asset_key, symbol, market, currency, holding_qty, holding_price, cost_basis, holding_tags, last_price, price_updated_at, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
            )
            ON CONFLICT (asset_key) DO UPDATE
            SET
              symbol = EXCLUDED.symbol,
              market = EXCLUDED.market,
              currency = EXCLUDED.currency,
              holding_qty = EXCLUDED.holding_qty,
              holding_price = EXCLUDED.holding_price,
              cost_basis = EXCLUDED.cost_basis,
              holding_tags = EXCLUDED.holding_tags,
              last_price = CASE
                WHEN EXCLUDED.holding_price > 0 THEN EXCLUDED.holding_price
                ELSE daa_asset_universe.last_price
              END,
              price_updated_at = CASE
                WHEN EXCLUDED.holding_price > 0 THEN NOW()
                ELSE daa_asset_universe.price_updated_at
              END,
              updated_at = NOW()
          `,
          [assetKey, symbol, market, currency, qty, price, costBasis, tags, lastPrice, priceUpdatedAt],
        );
      }

      await query(
        "DELETE FROM daa_asset_universe WHERE watch_enabled = FALSE AND holding_qty <= 0",
      );
      await replacePositionsV2SnapshotInTx(
        query as DaaTxQueryFn,
        rows.map((raw) => ({
          assetKey: raw.assetKey,
          symbol: raw.symbol,
          market: raw.market,
          currency: raw.currency,
          qty: raw.qty,
          price: raw.price,
          costBasis: raw.costBasis,
          tags: raw.tags,
          updatedAt: new Date().toISOString(),
        })),
      );

      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("positionStore.rollback", err);
      }
      throw error;
    }

    const result = await query(
      "SELECT asset_key, symbol, market, currency, qty, price, cost_basis, tags, updated_at FROM daa_positions_v2 WHERE qty > 0 ORDER BY symbol ASC, market ASC",
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
        tags: Array.isArray(item.tags) ? item.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
        updatedAt: toIsoString(item.updated_at),
      } satisfies DaaStorePosition;
    });
  });
}

export async function listDaaBrokerPositions(
  brokerKind: DaaStoreBrokerKind = "sim",
): Promise<DaaStorePosition[]> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT broker_kind, account_id, asset_key, symbol, market, currency, qty, price, cost_basis, tags, updated_at
       FROM daa_broker_positions
       WHERE broker_kind = $1 AND qty > 0
       ORDER BY symbol ASC, market ASC`,
      [brokerKind],
    );
    return result.rows.map((row) => mapBrokerPositionRow(row as Record<string, unknown>));
  });
}

export async function replaceDaaBrokerPositions(input: {
  brokerKind: DaaStoreBrokerKind;
  accountId?: string | null;
  rows: Array<Partial<DaaStorePosition>>;
}): Promise<DaaStorePosition[]> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      await query("DELETE FROM daa_broker_positions WHERE broker_kind = $1", [input.brokerKind]);
      for (const raw of input.rows) {
        const row = normalizePositionSnapshotRow(raw);
        if (!row || !(row.qty > 0)) continue;

        await query(
          `INSERT INTO daa_broker_positions (
             broker_kind, account_id, asset_key, symbol, market, currency, qty, price, cost_basis, tags, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
           )
           ON CONFLICT (broker_kind, asset_key) DO UPDATE
           SET
             account_id = EXCLUDED.account_id,
             symbol = EXCLUDED.symbol,
             market = EXCLUDED.market,
             currency = EXCLUDED.currency,
             qty = EXCLUDED.qty,
             price = EXCLUDED.price,
             cost_basis = EXCLUDED.cost_basis,
             tags = EXCLUDED.tags,
             updated_at = EXCLUDED.updated_at`,
          [
            input.brokerKind,
            input.accountId ?? null,
            row.assetKey,
            row.symbol,
            row.market,
            row.currency,
            row.qty,
            row.price,
            row.costBasis,
            row.tags,
            row.updatedAt,
          ],
        );

        await query(
          `INSERT INTO daa_asset_universe (
             asset_key, symbol, market, currency, last_price, price_updated_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, NOW(), NOW()
           )
           ON CONFLICT (asset_key) DO UPDATE
           SET
             symbol = EXCLUDED.symbol,
             market = EXCLUDED.market,
             currency = EXCLUDED.currency,
             last_price = CASE
               WHEN EXCLUDED.last_price > 0 THEN EXCLUDED.last_price
               ELSE daa_asset_universe.last_price
             END,
             price_updated_at = CASE
               WHEN EXCLUDED.last_price > 0 THEN EXCLUDED.price_updated_at
               ELSE daa_asset_universe.price_updated_at
             END,
             updated_at = NOW()`,
          [
            row.assetKey,
            row.symbol,
            row.market,
            row.currency,
            row.price,
            row.price > 0 ? row.updatedAt : null,
          ],
        );
      }
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("positionStore.rollback", err);
      }
      throw error;
    }

    const result = await query(
      `SELECT broker_kind, account_id, asset_key, symbol, market, currency, qty, price, cost_basis, tags, updated_at
       FROM daa_broker_positions
       WHERE broker_kind = $1 AND qty > 0
       ORDER BY symbol ASC, market ASC`,
      [input.brokerKind],
    );
    return result.rows.map((row) => mapBrokerPositionRow(row as Record<string, unknown>));
  });
}

