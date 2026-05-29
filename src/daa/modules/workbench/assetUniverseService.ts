import {
  buildActualWeightMap,
  buildFxLookupToBase,
  resolveFxRateToBase,
  summarizeMarkToMarketPortfolio,
} from "@/src/daa/modules/portfolio/portfolioValuation";
import type { DaaStoreAssetUniverseRow, DaaStoreFxRate } from "@/src/daa/store/daaStorePg";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { toFinite } from "@/src/daa/utils/normalize";
import { getAssetDisplayName } from "@/src/daa/assetRegistry";

import type { AssetUniverseView, WorkbenchPriceStatus } from "./workbenchTypes";

const PRICE_STALE_SECONDS = 6 * 60 * 60;

function toAgeSeconds(value: string | null): number | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

function classifyPriceStatus(input: {
  price: number;
  priceAgeSec: number | null;
  yfinanceSymbol: string;
}): WorkbenchPriceStatus {
  if (!input.yfinanceSymbol) return "unsupported";
  if (!(input.price > 0)) return "missing";
  if (input.priceAgeSec == null) return "stale";
  if (input.priceAgeSec > PRICE_STALE_SECONDS) return "stale";
  return "fresh";
}

export function buildAssetUniverseViewRows(input: {
  rows: DaaStoreAssetUniverseRow[];
  fxRates: DaaStoreFxRate[];
  baseCurrency: string;
  cash: number;
}): AssetUniverseView[] {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const baseCurrency = String(input.baseCurrency || "USD").trim().toUpperCase() || "USD";
  const fxLookup = buildFxLookupToBase(input.fxRates || []);

  const valuation = summarizeMarkToMarketPortfolio({
    positions: rows.map((row) => ({
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
      qty: row.holdingQty,
      lastPrice: row.lastPrice,
      holdingPrice: row.holdingPrice,
    })),
    baseCurrency,
    cash: input.cash,
    fxLookup,
  });
  const valuationRows = valuation.rows;
  const holdingsValue = valuation.holdingsValue;
  const portfolioBase = holdingsValue + Math.max(0, toFinite(input.cash));
  const actualWeightMap = buildActualWeightMap(valuationRows, portfolioBase);

  return rows.map((row, index) => {
    const valuation = valuationRows[index];
    const fxRateToBase = resolveFxRateToBase(baseCurrency, row.currency, fxLookup);
    const targetWeightPct = Math.max(0, toFinite(row.targetWeightHint ?? 0)) * 100;
    const actualWeightPct = actualWeightMap.get(row.assetKey) ?? 0;
    const gapPct = targetWeightPct > 0 || actualWeightPct > 0 ? targetWeightPct - actualWeightPct : null;
    const yfinanceSymbol = toYfinanceSymbolByMarket(row.symbol, row.market);
    const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    const priceAgeSec = toAgeSeconds(row.priceUpdatedAt);
    const priceStatus = classifyPriceStatus({
      price,
      priceAgeSec,
      yfinanceSymbol,
    });

    const valBase = valuation?.baseValue ?? 0;
    const costInBase = row.costBasisInBase ?? null;
    const hasCostInBase = costInBase != null && costInBase > 0;
    const unrealizedPnlBase = valBase > 0 && hasCostInBase ? valBase - costInBase : null;
    const unrealizedPnlPct = hasCostInBase ? ((valBase - costInBase) / costInBase) * 100 : null;

    return {
      assetKey: row.assetKey,
      symbol: row.symbol,
      name: row.name,
      displayNameZh: row.displayNameZh || getAssetDisplayName(row.symbol),
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
      costBasisInBase: hasCostInBase ? costInBase : null,
      unrealizedPnlBase,
      unrealizedPnlPct,
      holdingTags: row.holdingTags,
      watchEnabled: row.watchEnabled,
      targetWeightHint: row.targetWeightHint,
      watchTags: row.watchTags,
      notes: row.notes,
      priceAlertAbove: row.priceAlertAbove ?? null,
      priceAlertBelow: row.priceAlertBelow ?? null,
      lastPrice: row.lastPrice,
      priceUpdatedAt: row.priceUpdatedAt,
      priceStatus,
      priceSource: yfinanceSymbol ? `yfinance:${yfinanceSymbol}` : "asset_universe",
      priceAgeSec,
      valuationBase: valuation?.baseValue ?? null,
      fxRateToBase,
      fxMissing: Boolean(valuation?.fxMissing),
      actualWeightPct,
      targetWeightPct,
      gapPct,
      hfSignal: null,
    } satisfies AssetUniverseView;
  }).sort((a, b) => {
    const aHas = a.holdingQty > 0 ? 1 : 0;
    const bHas = b.holdingQty > 0 ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return a.symbol.localeCompare(b.symbol) || a.market.localeCompare(b.market);
  });
}
