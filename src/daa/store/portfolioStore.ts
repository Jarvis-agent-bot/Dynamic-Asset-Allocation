/**
 * Portfolio store functions.
 */

import { randomUUID } from "node:crypto";
import { normalizeText, toFinite, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { buildDaaAssetKey, parseDaaAssetKey } from "@/src/daa/assetKey";
import { buildFxLookupToBase, summarizeMarkToMarketPortfolio } from "@/src/daa/modules/portfolio/portfolioValuation";
import { withDaaPgClient, parseJsonb, toIsoString, type DaaTxQueryFn } from "./storeShared";
import type { DaaStoreEquitySnapshot, DaaStoreHumanIngestState, DaaStoreCandidateAsset } from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";
import { buildPositionKey } from "./positionStore";

function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAlias(value, fallback);
}

export function mapEquitySnapshotRow(row: Record<string, unknown>): DaaStoreEquitySnapshot {
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
  const n = Math.max(1, Math.min(2000, Math.trunc(toFiniteNumber(limit, 200))));
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT ts, total_equity, holdings_value, cash, source FROM daa_equity_snapshots_v2 ORDER BY ts DESC LIMIT $1",
      [n],
    );
    return result.rows.map((row) => mapEquitySnapshotRow(row as Record<string, unknown>));
  });
}

export async function appendDaaEquitySnapshot(snapshot: Partial<DaaStoreEquitySnapshot>): Promise<DaaStoreEquitySnapshot> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const ts = toIsoString(snapshot.ts, new Date().toISOString());
    const totalEquity = Math.max(0, toFiniteNumber(snapshot.totalEquity));
    const holdingsValue = Math.max(0, toFiniteNumber(snapshot.holdingsValue));
    const cash = Math.max(0, toFiniteNumber(snapshot.cash));
    const source = normalizeText(snapshot.source, "manual");

    await query(
      "INSERT INTO daa_equity_snapshots_v2 (ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (ts) DO UPDATE SET total_equity=EXCLUDED.total_equity, holdings_value=EXCLUDED.holdings_value, cash=EXCLUDED.cash, source=EXCLUDED.source",
      [ts, totalEquity, holdingsValue, cash, source],
    );

    const result = await query(
      "SELECT ts, total_equity, holdings_value, cash, source FROM daa_equity_snapshots_v2 WHERE ts = $1 LIMIT 1",
      [ts],
    );
    return mapEquitySnapshotRow(result.rows[0] as Record<string, unknown>);
  });
}

export function mapHumanIngestStateRow(row: Record<string, unknown>): DaaStoreHumanIngestState {
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

export function mapCandidateAssetRow(row: Record<string, unknown>): DaaStoreCandidateAsset {
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
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      "SELECT asset_key, symbol, market, currency, watch_enabled, target_weight_hint, watch_tags, notes, created_at, updated_at FROM daa_asset_universe WHERE watch_enabled = TRUE ORDER BY symbol ASC, market ASC",
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
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      await query(
        "UPDATE daa_asset_universe SET watch_enabled = FALSE, target_weight_hint = 0, watch_tags = '{}'::TEXT[], notes = NULL, updated_at = NOW()",
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

        await query(
          `
            INSERT INTO daa_asset_universe (
              asset_key, symbol, market, currency, watch_enabled, target_weight_hint, watch_tags, notes, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
            )
            ON CONFLICT (asset_key) DO UPDATE
            SET
              symbol = EXCLUDED.symbol,
              market = EXCLUDED.market,
              currency = EXCLUDED.currency,
              watch_enabled = EXCLUDED.watch_enabled,
              target_weight_hint = EXCLUDED.target_weight_hint,
              watch_tags = EXCLUDED.watch_tags,
              notes = EXCLUDED.notes,
              updated_at = NOW()
          `,
          [assetKey, symbol, market, currency, enabled, targetWeightHint, tags, notes || null],
        );
      }
      await query(
        "DELETE FROM daa_asset_universe WHERE watch_enabled = FALSE AND holding_qty <= 0",
      );
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("portfolioStore.rollback", err);
      }
      throw error;
    }

    const result = await query(
      "SELECT asset_key, symbol, market, currency, watch_enabled, target_weight_hint, watch_tags, notes, created_at, updated_at FROM daa_asset_universe WHERE watch_enabled = TRUE ORDER BY symbol ASC, market ASC",
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
  const [holdingsRes, fxRes] = await Promise.all([
    query(`
      SELECT
        p.symbol,
        p.market,
        p.currency,
        p.qty AS holding_qty,
        p.price AS holding_price,
        COALESCE(u.last_price, p.price, 0) AS last_price
      FROM daa_positions_v2 p
      LEFT JOIN daa_asset_universe u ON u.asset_key = p.asset_key
      WHERE p.qty > 0
    `),
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

export async function appendAssetPriceHistoryRows(rows: Array<{ assetKey: string; ts?: string; price: number; source?: string; open?: number; high?: number; low?: number; volume?: number }>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    let inserted = 0;
    await query("BEGIN");
    try {
      for (const row of rows) {
        const parsedAssetKey = parseDaaAssetKey(row.assetKey);
        if (!parsedAssetKey) {
          throw new Error(`price history assetKey invalid: ${normalizeText(row.assetKey) || "unknown"}`);
        }
        const assetKey = buildDaaAssetKey(parsedAssetKey.symbol, parsedAssetKey.market);
        const price = Math.max(0, toFiniteNumber(row.price));
        if (!assetKey || price <= 0) continue;
        const ts = toIsoString(row.ts, new Date().toISOString());
        const source = normalizeText(row.source, "yfinance");
        const openPrice = row.open != null && Number.isFinite(row.open) && row.open > 0 ? row.open : null;
        const highPrice = row.high != null && Number.isFinite(row.high) && row.high > 0 ? row.high : null;
        const lowPrice = row.low != null && Number.isFinite(row.low) && row.low > 0 ? row.low : null;
        const volume = row.volume != null && Number.isFinite(row.volume) && row.volume >= 0 ? row.volume : null;

        await query(
          `INSERT INTO daa_price_history (symbol, ts, price, source, open_price, high_price, low_price, volume)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (symbol, ts) DO UPDATE SET price = EXCLUDED.price, source = EXCLUDED.source,
             open_price = COALESCE(EXCLUDED.open_price, daa_price_history.open_price),
             high_price = COALESCE(EXCLUDED.high_price, daa_price_history.high_price),
             low_price = COALESCE(EXCLUDED.low_price, daa_price_history.low_price),
             volume = COALESCE(EXCLUDED.volume, daa_price_history.volume)`,
          [assetKey, ts, price, source, openPrice, highPrice, lowPrice, volume],
        );
        inserted += 1;
      }
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("portfolioStore.rollback", err);
      }
      throw error;
    }

    return inserted;
  });
}

