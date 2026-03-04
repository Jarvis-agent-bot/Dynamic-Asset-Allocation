import {
  buildActualWeightMapV1,
  buildFxLookupToBaseV1,
  buildPositionValuationRowsV1,
  resolveFxRateToBaseV1,
} from "@/src/daa/modules/portfolio/portfolioValuationV1";
import type { DaaStoreAssetUniverseRowV1, DaaStoreFxRateV1 } from "@/src/daa/store/daaStorePgV1";
import { toYfinanceSymbolByMarketV1 } from "@/src/market/yfinanceSymbolV1";

import type { AssetUniverseViewV1, WorkbenchPriceStatusV1 } from "./workbenchTypesV1";

const PRICE_STALE_SECONDS = 6 * 60 * 60;

function toFinite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toAgeSeconds(value: string | null): number | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

function classifyPriceStatusV1(input: {
  price: number;
  priceAgeSec: number | null;
  yfinanceSymbol: string;
}): WorkbenchPriceStatusV1 {
  if (!input.yfinanceSymbol) return "unsupported";
  if (!(input.price > 0)) return "missing";
  if (input.priceAgeSec == null) return "stale";
  if (input.priceAgeSec > PRICE_STALE_SECONDS) return "stale";
  return "fresh";
}

export function buildAssetUniverseViewRowsV1(input: {
  rows: DaaStoreAssetUniverseRowV1[];
  fxRates: DaaStoreFxRateV1[];
  baseCurrency: string;
  cash: number;
  targetWeights: Record<string, number>;
}): AssetUniverseViewV1[] {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const baseCurrency = String(input.baseCurrency || "USD").trim().toUpperCase() || "USD";
  const fxLookup = buildFxLookupToBaseV1(input.fxRates || []);

  const holdingRows = rows.map((row) => ({
    symbol: row.symbol,
    market: row.market,
    currency: row.currency,
    qty: row.holdingQty,
    price: row.holdingPrice > 0 ? row.holdingPrice : row.lastPrice,
  }));

  const valuationRows = buildPositionValuationRowsV1(holdingRows, baseCurrency, fxLookup);
  const holdingsValue = valuationRows.reduce((sum, row) => sum + (row.baseValue ?? 0), 0);
  const portfolioBase = holdingsValue + Math.max(0, toFinite(input.cash));
  const actualWeightMap = buildActualWeightMapV1(valuationRows, portfolioBase);

  return rows.map((row, index) => {
    const valuation = valuationRows[index];
    const fxRateToBase = resolveFxRateToBaseV1(baseCurrency, row.currency, fxLookup);
    const targetWeightPct = Math.max(0, toFinite(input.targetWeights?.[row.assetKey] ?? row.targetWeightHint ?? 0)) * 100;
    const actualWeightPct = actualWeightMap.get(row.assetKey) ?? 0;
    const gapPct = targetWeightPct > 0 || actualWeightPct > 0 ? targetWeightPct - actualWeightPct : null;
    const yfinanceSymbol = toYfinanceSymbolByMarketV1(row.symbol, row.market);
    const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    const priceAgeSec = toAgeSeconds(row.priceUpdatedAt);
    const priceStatus = classifyPriceStatusV1({
      price,
      priceAgeSec,
      yfinanceSymbol,
    });

    return {
      assetKey: row.assetKey,
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
      assetClass: row.assetClass,
      region: row.region,
      exchange: row.exchange,
      instrumentType: row.instrumentType,
      marketGroup: row.marketGroup,
      yfinanceSymbol,
      holdingQty: row.holdingQty,
      holdingPrice: row.holdingPrice,
      costBasis: row.costBasis,
      holdingTags: row.holdingTags,
      watchEnabled: row.watchEnabled,
      targetWeightHint: row.targetWeightHint,
      watchTags: row.watchTags,
      notes: row.notes,
      lastPrice: row.lastPrice,
      priceUpdatedAt: row.priceUpdatedAt,
      priceStatus,
      priceAsOf: row.priceUpdatedAt,
      priceSource: yfinanceSymbol ? `yfinance:${yfinanceSymbol}` : "asset_universe",
      priceAgeSec,
      valuationBase: valuation?.baseValue ?? null,
      fxRateToBase,
      fxMissing: Boolean(valuation?.fxMissing),
      actualWeightPct,
      targetWeightPct,
      gapPct,
    } satisfies AssetUniverseViewV1;
  }).sort((a, b) => {
    const aHas = a.holdingQty > 0 ? 1 : 0;
    const bHas = b.holdingQty > 0 ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return a.symbol.localeCompare(b.symbol) || a.market.localeCompare(b.market);
  });
}
