/**
 * Position store functions.
 */

import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { buildDaaAssetKey } from "@/src/daa/assetKey";
import {
  buildFxRateBook,
  resolveFxRateToBaseCurrency,
} from "@/src/daa/modules/money/money";
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

export type CostBasisInBaseMode = "auto" | "preserve" | "recompute";

type NormalizedPositionSnapshotRow = DaaPositionSnapshotRow & {
  costBasisProvided: boolean;
  costBasisInBaseProvided: boolean;
  currencyProvided: boolean;
};

function hasOwn(input: object, key: keyof DaaPositionSnapshotRow): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizePositionSnapshotRow(row: Partial<DaaPositionSnapshotRow>): NormalizedPositionSnapshotRow | null {
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
    costBasisProvided: hasOwn(row, "costBasis"),
    costBasisInBaseProvided: hasOwn(row, "costBasisInBase"),
    currencyProvided: hasOwn(row, "currency"),
  };
}

function normalizeCostBasisInBase(value: unknown): number | null {
  if (value == null) return null;
  return Math.max(0, toFiniteNumber(value, 0));
}

async function resolveBaseCurrencyInTx(query: DaaTxQueryFn, ownerAccountId: string): Promise<string> {
  const accountRes = await query(
    "SELECT base_currency FROM daa_account_state_v2 WHERE id = $1 LIMIT 1",
    [ownerAccountId],
  );
  return normalizeCcyCode(accountRes.rows[0]?.base_currency, "USD");
}

async function resolveCostBasisInBaseFromFxInTx(input: {
  query: DaaTxQueryFn;
  ownerAccountId: string;
  costBasis: number | null;
  localCurrency: string;
}): Promise<number | null> {
  if (input.costBasis == null) return null;
  const costBasis = Math.max(0, toFiniteNumber(input.costBasis, 0));
  if (!(costBasis > 0)) return 0;

  const baseCurrency = await resolveBaseCurrencyInTx(input.query, input.ownerAccountId);
  const fxRes = await input.query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates");
  const fxRateToBase = resolveFxRateToBaseCurrency(
    baseCurrency,
    input.localCurrency,
    buildFxRateBook(fxRes.rows as Array<Record<string, unknown>>),
  );
  if (!(fxRateToBase && fxRateToBase > 0)) return null;
  return costBasis * fxRateToBase;
}

async function resolveCostBasisInBaseForWriteInTx(input: {
  query: DaaTxQueryFn;
  ownerAccountId: string;
  row: NormalizedPositionSnapshotRow;
  mode: CostBasisInBaseMode;
  existingCostBasisInBase?: unknown;
}): Promise<number | null> {
  if (input.row.costBasisInBaseProvided) {
    return input.row.costBasisInBase;
  }

  const existing = normalizeCostBasisInBase(input.existingCostBasisInBase);
  const shouldPreserveExisting = input.mode === "preserve"
    || (input.mode === "auto" && !input.row.costBasisProvided && !input.row.currencyProvided);
  if (shouldPreserveExisting && existing != null) {
    return existing;
  }

  return resolveCostBasisInBaseFromFxInTx({
    query: input.query,
    ownerAccountId: input.ownerAccountId,
    costBasis: input.row.costBasis,
    localCurrency: input.row.currency,
  });
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
    const costBasisInBase = await resolveCostBasisInBaseForWriteInTx({
      query,
      ownerAccountId,
      row,
      mode: "recompute",
    });
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
        costBasisInBase,
        row.tags,
        row.updatedAt,
      ],
    );
  }
}

export async function syncSinglePositionV2InTx(
  query: DaaTxQueryFn,
  row: Partial<DaaPositionSnapshotRow>,
  opts: { costBasisInBaseMode?: CostBasisInBaseMode } = {},
): Promise<void> {
  const ownerAccountId = getDaaAccountScopeId();
  const normalized = normalizePositionSnapshotRow(row);
  if (!normalized) return;
  if (!(normalized.qty > 0)) {
    await query("DELETE FROM daa_positions_v2 WHERE owner_account_id = $1 AND asset_key = $2", [ownerAccountId, normalized.assetKey]);
    return;
  }
  const existing = await query(
    "SELECT cost_basis_in_base FROM daa_positions_v2 WHERE owner_account_id = $1 AND asset_key = $2 LIMIT 1",
    [ownerAccountId, normalized.assetKey],
  );
  const costBasisInBase = await resolveCostBasisInBaseForWriteInTx({
    query,
    ownerAccountId,
    row: normalized,
    mode: opts.costBasisInBaseMode ?? "auto",
    existingCostBasisInBase: existing.rows[0]?.cost_basis_in_base,
  });
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
      costBasisInBase,
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
