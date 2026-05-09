/**
 * FX-rate store functions.
 */

import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  buildFxRateBook,
  normalizeMoneyCurrency,
  normalizeMoneyPair,
  resolveFxRateToBaseCurrency,
  type FxRateBook,
} from "@/src/daa/modules/money/money";
import { withDaaPgClient, toIsoString } from "./storeShared";
import type { DaaStoreFxRate } from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";

export function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeMoneyCurrency(value, fallback);
}

function normalizeFxPair(baseCcy: string, quoteCcy: string): string {
  return normalizeMoneyPair(baseCcy, quoteCcy);
}

type DaaFxLookupMap = FxRateBook;

export function buildFxLookupMap(rows: Array<Record<string, unknown>>): DaaFxLookupMap {
  return buildFxRateBook(rows);
}

export function resolveFxRateToBase(
  baseCurrency: string,
  instrumentCurrency: string,
  fxMap: DaaFxLookupMap,
): number | null {
  return resolveFxRateToBaseCurrency(baseCurrency, instrumentCurrency, fxMap);
}

function mapFxRateRow(row: Record<string, unknown>): DaaStoreFxRate {
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
