/**
 * FX-rate store functions.
 */

import { normalizeText, toFinite, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { withDaaPgClient, toIsoString } from "./storeShared";
import type { DaaStoreFxRate } from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";

export function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAlias(value, fallback);
}

export function normalizeFxPair(baseCcy: string, quoteCcy: string): string {
  return `${normalizeCcyCode(baseCcy)}/${normalizeCcyCode(quoteCcy)}`;
}

export type DaaFxLookupMap = Map<string, number>;

export function buildFxLookupMap(rows: Array<Record<string, unknown>>): DaaFxLookupMap {
  const out = new Map<string, number>();
  for (const row of rows) {
    const base = normalizeCcyCode(row.base_ccy, "USD");
    const quote = normalizeCcyCode(row.quote_ccy, "USD");
    const rate = Math.max(0, toFiniteNumber(row.rate, 0));
    if (!base || !quote || rate <= 0) continue;
    out.set(normalizeFxPair(base, quote), rate);
  }
  return out;
}

export function resolveFxRateToBase(
  baseCurrency: string,
  instrumentCurrency: string,
  fxMap: DaaFxLookupMap,
): number | null {
  const base = normalizeCcyCode(baseCurrency, "USD");
  const local = normalizeCcyCode(instrumentCurrency, base);
  if (local === base) return 1;
  const direct = fxMap.get(normalizeFxPair(local, base));
  if (direct && direct > 0) return direct;
  const reverse = fxMap.get(normalizeFxPair(base, local));
  if (reverse && reverse > 0) return 1 / reverse;
  return null;
}

export function mapFxRateRow(row: Record<string, unknown>): DaaStoreFxRate {
  return {
    id: normalizeText(row.id),
    baseCcy: normalizeCcyCode(row.base_ccy),
    quoteCcy: normalizeCcyCode(row.quote_ccy),
    rate: Math.max(0, toFiniteNumber(row.rate)),
    source: normalizeText(row.source, "manual"),
    asOfTs: toIsoString(row.as_of_ts),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaFxRates(): Promise<DaaStoreFxRate[]> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at FROM daa_fx_rates ORDER BY base_ccy ASC, quote_ccy ASC",
    );
    return result.rows.map((row) => mapFxRateRow(row as Record<string, unknown>));
  });
}

export async function replaceDaaFxRates(rows: Array<Partial<DaaStoreFxRate>>): Promise<DaaStoreFxRate[]> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      await query("DELETE FROM daa_fx_rates");
      const dedup = new Map<string, { id: string; baseCcy: string; quoteCcy: string; rate: number; source: string; asOfTs: string }>();
      for (const raw of rows) {
        const baseCcy = normalizeCcyCode(raw.baseCcy, "USD");
        const quoteCcy = normalizeCcyCode(raw.quoteCcy, "USD");
        const rate = Math.max(0, toFiniteNumber(raw.rate));
        if (rate <= 0) continue;
        const pair = normalizeFxPair(baseCcy, quoteCcy);
        const id = normalizeText(raw.id, pair);
        const source = normalizeText(raw.source, "manual");
        const asOfTs = toIsoString(raw.asOfTs, new Date().toISOString());
        dedup.set(pair, { id, baseCcy, quoteCcy, rate, source, asOfTs });
      }

      for (const row of dedup.values()) {
        await query(
          "INSERT INTO daa_fx_rates (id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())",
          [row.id, row.baseCcy, row.quoteCcy, row.rate, row.source, row.asOfTs],
        );
      }
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("fxStore.rollback", err);
      }
      throw error;
    }
    const result = await query(
      "SELECT id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at FROM daa_fx_rates ORDER BY base_ccy ASC, quote_ccy ASC",
    );
    return result.rows.map((row) => mapFxRateRow(row as Record<string, unknown>));
  });
}

export async function upsertDaaFxRates(rows: Array<Partial<DaaStoreFxRate>>): Promise<DaaStoreFxRate[]> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      for (const raw of rows) {
        const baseCcy = normalizeCcyCode(raw.baseCcy, "USD");
        const quoteCcy = normalizeCcyCode(raw.quoteCcy, "USD");
        const rate = Math.max(0, toFiniteNumber(raw.rate));
        if (rate <= 0) continue;
        const id = normalizeText(raw.id, normalizeFxPair(baseCcy, quoteCcy));
        const source = normalizeText(raw.source, "manual");
        const asOfTs = toIsoString(raw.asOfTs, new Date().toISOString());

        await query(
          "INSERT INTO daa_fx_rates (id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (id) DO UPDATE SET base_ccy = EXCLUDED.base_ccy, quote_ccy = EXCLUDED.quote_ccy, rate = EXCLUDED.rate, source = EXCLUDED.source, as_of_ts = EXCLUDED.as_of_ts, updated_at = NOW()",
          [id, baseCcy, quoteCcy, rate, source, asOfTs],
        );
      }
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("fxStore.rollback", err);
      }
      throw error;
    }
    const result = await query(
      "SELECT id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at FROM daa_fx_rates ORDER BY base_ccy ASC, quote_ccy ASC",
    );
    return result.rows.map((row) => mapFxRateRow(row as Record<string, unknown>));
  });
}

