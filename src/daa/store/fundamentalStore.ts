/**
 * Fundamentals store functions.
 */

import { normalizeText, normalizeUpper, parseJsonb, toFiniteNumber, toIsoString, withDaaPgClient } from "./storeShared";
import type { DaaStoreFundamentalSnapshot } from "./storeTypes";
import { ensureDaaMarketCacheSchemaPg } from "./storeSchema";

const FUNDAMENTAL_SNAPSHOT_SELECT_COLUMNS = [
  "provider",
  "normalized_symbol",
  "symbol",
  "market",
  "currency",
  "market_cap",
  "trailing_pe",
  "pb_ratio",
  "debt_to_equity",
  "free_cashflow",
  "total_revenue",
  "net_income",
  "trailing_eps",
  "snapshot_json",
  "fetched_at",
  "expire_at",
  "raw_ref_id",
  "updated_at",
].join(", ");

function toNullableFinite(value: unknown): number | null {
  if (value == null) return null;
  const n = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function readSnapshotNumber(snapshot: Record<string, unknown>, key: string): number | null {
  return toNullableFinite(snapshot[key]);
}

function inferMarketFromNormalizedSymbol(symbol: string): string {
  const upper = normalizeUpper(symbol, "US");
  if (upper.endsWith(".HK")) return "HK";
  if (upper.endsWith(".KS") || upper.endsWith(".KQ")) return "KR";
  if (upper.endsWith(".T")) return "JP";
  if (upper.includes("-USD")) return "CRYPTO";
  return "US";
}

function mapFundamentalSnapshotRow(row: Record<string, unknown>): DaaStoreFundamentalSnapshot {
  return {
    provider: normalizeText(row.provider, "yfinance"),
    normalizedSymbol: normalizeUpper(row.normalized_symbol),
    symbol: normalizeUpper(row.symbol),
    market: normalizeUpper(row.market, "US"),
    currency: normalizeUpper(row.currency, "USD"),
    marketCap: toNullableFinite(row.market_cap),
    trailingPE: toNullableFinite(row.trailing_pe),
    pbRatio: toNullableFinite(row.pb_ratio),
    debtToEquity: toNullableFinite(row.debt_to_equity),
    freeCashflow: toNullableFinite(row.free_cashflow),
    totalRevenue: toNullableFinite(row.total_revenue),
    netIncome: toNullableFinite(row.net_income),
    trailingEps: toNullableFinite(row.trailing_eps),
    snapshotJson: parseJsonb<Record<string, unknown>>(row.snapshot_json, {}),
    fetchedAt: toIsoString(row.fetched_at, new Date().toISOString()),
    expireAt: row.expire_at == null ? null : toIsoString(row.expire_at, new Date().toISOString()),
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id) || null,
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

export async function upsertDaaFundamentalSnapshots(
  rows: Array<Partial<DaaStoreFundamentalSnapshot>>,
): Promise<DaaStoreFundamentalSnapshot[]> {
  if (!rows.length) return [];
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const out: DaaStoreFundamentalSnapshot[] = [];
    for (const row of rows) {
      const snapshotJson = row.snapshotJson && typeof row.snapshotJson === "object" ? row.snapshotJson : {};
      const provider = normalizeText(row.provider, "yfinance");
      const normalizedSymbol = normalizeUpper(row.normalizedSymbol || snapshotJson.normalizedSymbol || snapshotJson.symbol);
      if (!normalizedSymbol) continue;
      const symbol = normalizeUpper(row.symbol || snapshotJson.symbol || normalizedSymbol, normalizedSymbol);
      const market = normalizeUpper(row.market, inferMarketFromNormalizedSymbol(normalizedSymbol));
      const currency = normalizeUpper(row.currency || snapshotJson.marketCapCurrency || snapshotJson.marketPriceCurrency, "USD");
      const fetchedAt = toIsoString(row.fetchedAt, new Date().toISOString());
      const expireAt = row.expireAt == null ? null : toIsoString(row.expireAt, new Date().toISOString());
      const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;

      const result = await query(
        `INSERT INTO daa_fundamental_snapshot_v1 (
           provider, normalized_symbol, symbol, market, currency,
           market_cap, trailing_pe, pb_ratio, debt_to_equity,
           free_cashflow, total_revenue, net_income, trailing_eps,
           snapshot_json, fetched_at, expire_at, raw_ref_id, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,NOW())
         ON CONFLICT (provider, normalized_symbol)
         DO UPDATE SET
           symbol = EXCLUDED.symbol,
           market = EXCLUDED.market,
           currency = EXCLUDED.currency,
           market_cap = EXCLUDED.market_cap,
           trailing_pe = EXCLUDED.trailing_pe,
           pb_ratio = EXCLUDED.pb_ratio,
           debt_to_equity = EXCLUDED.debt_to_equity,
           free_cashflow = EXCLUDED.free_cashflow,
           total_revenue = EXCLUDED.total_revenue,
           net_income = EXCLUDED.net_income,
           trailing_eps = EXCLUDED.trailing_eps,
           snapshot_json = EXCLUDED.snapshot_json,
           fetched_at = EXCLUDED.fetched_at,
           expire_at = EXCLUDED.expire_at,
           raw_ref_id = EXCLUDED.raw_ref_id,
           updated_at = NOW()
         RETURNING ${FUNDAMENTAL_SNAPSHOT_SELECT_COLUMNS}`,
        [
          provider,
          normalizedSymbol,
          symbol,
          market,
          currency,
          row.marketCap ?? readSnapshotNumber(snapshotJson, "marketCap"),
          row.trailingPE ?? readSnapshotNumber(snapshotJson, "trailingPE"),
          row.pbRatio ?? readSnapshotNumber(snapshotJson, "pbRatio"),
          row.debtToEquity ?? readSnapshotNumber(snapshotJson, "debtToEquity"),
          row.freeCashflow ?? readSnapshotNumber(snapshotJson, "freeCashflow"),
          row.totalRevenue ?? readSnapshotNumber(snapshotJson, "totalRevenue"),
          row.netIncome ?? readSnapshotNumber(snapshotJson, "netIncome"),
          row.trailingEps ?? readSnapshotNumber(snapshotJson, "trailingEps"),
          JSON.stringify(snapshotJson),
          fetchedAt,
          expireAt,
          rawRefId,
        ],
      );
      if (result.rows[0]) out.push(mapFundamentalSnapshotRow(result.rows[0] as Record<string, unknown>));
    }
    return out;
  });
}

export async function getLatestDaaFundamentalSnapshot(input: {
  provider?: string;
  normalizedSymbol: string;
  freshOnly?: boolean;
  nowIso?: string;
}): Promise<DaaStoreFundamentalSnapshot | null> {
  const items = await listDaaFundamentalSnapshots({
    provider: input.provider,
    normalizedSymbols: [input.normalizedSymbol],
    freshOnly: input.freshOnly,
    nowIso: input.nowIso,
    limit: 1,
  });
  return items[0] ?? null;
}

export async function listDaaFundamentalSnapshots(input: {
  provider?: string;
  normalizedSymbols?: string[];
  freshOnly?: boolean;
  nowIso?: string;
  limit?: number;
} = {}): Promise<DaaStoreFundamentalSnapshot[]> {
  await ensureDaaMarketCacheSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const provider = normalizeText(input.provider, "yfinance");
    const normalizedSymbols = Array.isArray(input.normalizedSymbols)
      ? [...new Set(input.normalizedSymbols.map((item) => normalizeUpper(item)).filter(Boolean))]
      : [];
    const params: unknown[] = [provider];
    const where = ["provider = $1"];
    if (normalizedSymbols.length > 0) {
      params.push(normalizedSymbols);
      where.push(`normalized_symbol = ANY($${params.length})`);
    }
    if (input.freshOnly) {
      params.push(toIsoString(input.nowIso, new Date().toISOString()));
      where.push(`(expire_at IS NULL OR expire_at > $${params.length})`);
    }
    const limit = Math.max(1, Math.min(1000, Math.trunc(toFiniteNumber(input.limit, 200))));
    params.push(limit);

    const result = await query(
      `SELECT ${FUNDAMENTAL_SNAPSHOT_SELECT_COLUMNS}
       FROM daa_fundamental_snapshot_v1
       WHERE ${where.join(" AND ")}
       ORDER BY fetched_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapFundamentalSnapshotRow(row as Record<string, unknown>));
  });
}
