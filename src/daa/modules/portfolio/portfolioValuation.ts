import {
  buildDaaAssetKey,
  normalizeDaaCurrencyCode,
} from "@/src/daa/assetKey";
import {
  buildFxRateBook,
  convertLocalMoneyToBase,
  resolveFxRateToBaseCurrency,
  type FxRateBook,
} from "@/src/daa/modules/money/money";

export type DaaFxRateLike = {
  baseCcy?: unknown;
  quoteCcy?: unknown;
  rate?: unknown;
};

export type DaaPositionLike = {
  symbol?: unknown;
  market?: unknown;
  currency?: unknown;
  qty?: unknown;
  price?: unknown;
};

export type DaaMarkToMarketPositionLike = {
  symbol?: unknown;
  market?: unknown;
  currency?: unknown;
  qty?: unknown;
  lastPrice?: unknown;
  holdingPrice?: unknown;
};

export type DaaPositionValuationRow = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  localValue: number;
  baseValue: number | null;
  fxRateToBase: number | null;
  fxMissing: boolean;
};

export type DaaMarkToMarketValuationRow = DaaPositionValuationRow & {
  markPrice: number;
  markPriceSource: "last_price" | "holding_price" | "missing";
};

export type PortfolioEquitySource = "derived_mark_to_market" | "account_state_override";

export type PortfolioValuationSummary = {
  rows: DaaMarkToMarketValuationRow[];
  baseCurrency: string;
  holdingsValue: number;
  cash: number;
  derivedTotalEquity: number;
  totalEquity: number;
  fxMissingAssets: DaaMarkToMarketValuationRow[];
  equitySource: PortfolioEquitySource;
};

export function buildFxLookupToBase(rows: DaaFxRateLike[]): Map<string, number> {
  return buildFxRateBook(rows);
}

export function resolveFxRateToBase(
  baseCurrency: string,
  localCurrency: unknown,
  fxLookup: FxRateBook,
): number | null {
  return resolveFxRateToBaseCurrency(baseCurrency, localCurrency, fxLookup);
}

export function buildPositionValuationRows(
  positions: DaaPositionLike[],
  baseCurrency: string,
  fxLookup: FxRateBook,
): DaaPositionValuationRow[] {
  return positions.map((position) => {
    const symbol = String(position.symbol || "").trim().toUpperCase();
    const market = String(position.market || "US").trim().toUpperCase() || "US";
    const currency = normalizeDaaCurrencyCode(position.currency, baseCurrency);
    const localValue = Number(position.qty || 0) * Number(position.price || 0);
    const conversion = convertLocalMoneyToBase({
      amount: localValue,
      localCurrency: currency,
      baseCurrency,
      fxBook: fxLookup,
    });
    return {
      assetKey: buildDaaAssetKey(symbol, market),
      symbol,
      market,
      currency,
      localValue,
      baseValue: conversion.base?.amount ?? null,
      fxRateToBase: conversion.fxRateToBase,
      fxMissing: conversion.fxMissing,
    };
  });
}

export function resolveMarkToMarketPrice(input: {
  lastPrice?: unknown;
  holdingPrice?: unknown;
}): number {
  const lastPrice = Number(input.lastPrice);
  if (Number.isFinite(lastPrice) && lastPrice > 0) return lastPrice;
  const holdingPrice = Number(input.holdingPrice);
  if (Number.isFinite(holdingPrice) && holdingPrice > 0) return holdingPrice;
  return 0;
}

export function buildMarkToMarketValuationRows(
  positions: DaaMarkToMarketPositionLike[],
  baseCurrency: string,
  fxLookup: FxRateBook,
): DaaMarkToMarketValuationRow[] {
  return positions.map((position) => {
    const markPrice = resolveMarkToMarketPrice({
      lastPrice: position.lastPrice,
      holdingPrice: position.holdingPrice,
    });
    const baseRow = buildPositionValuationRows([
      {
        symbol: position.symbol,
        market: position.market,
        currency: position.currency,
        qty: position.qty,
        price: markPrice,
      },
    ], baseCurrency, fxLookup)[0];

    const hasLastPrice = Number(position.lastPrice) > 0;
    const hasHoldingPrice = Number(position.holdingPrice) > 0;
    return {
      ...(baseRow ?? {
        assetKey: buildDaaAssetKey(position.symbol, position.market),
        symbol: String(position.symbol || "").trim().toUpperCase(),
        market: String(position.market || "US").trim().toUpperCase() || "US",
        currency: normalizeDaaCurrencyCode(position.currency, baseCurrency),
        localValue: 0,
        baseValue: null,
        fxRateToBase: null,
        fxMissing: false,
      }),
      markPrice,
      markPriceSource: hasLastPrice ? "last_price" : (hasHoldingPrice ? "holding_price" : "missing"),
    };
  });
}

export function summarizeMarkToMarketPortfolio(input: {
  positions: DaaMarkToMarketPositionLike[];
  baseCurrency: string;
  cash?: unknown;
  fxLookup: FxRateBook;
  accountTotalEquity?: unknown;
}): PortfolioValuationSummary {
  const rows = buildMarkToMarketValuationRows(input.positions, input.baseCurrency, input.fxLookup);
  const holdingsValue = rows.reduce((sum, row) => sum + (row.baseValue ?? 0), 0);
  const cash = Math.max(0, Number(input.cash) || 0);
  const derivedTotalEquity = holdingsValue + cash;
  const accountTotalEquity = Number(input.accountTotalEquity);
  const hasAccountOverride = Number.isFinite(accountTotalEquity) && accountTotalEquity >= 0;
  return {
    rows,
    baseCurrency: normalizeDaaCurrencyCode(input.baseCurrency, "USD"),
    holdingsValue,
    cash,
    derivedTotalEquity,
    totalEquity: hasAccountOverride ? accountTotalEquity : derivedTotalEquity,
    fxMissingAssets: rows.filter((row) => row.fxMissing),
    equitySource: hasAccountOverride ? "account_state_override" : "derived_mark_to_market",
  };
}

export function buildActualWeightMap(
  valuationRows: DaaPositionValuationRow[],
  portfolioBase: number,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!(portfolioBase > 0)) return map;
  for (const row of valuationRows) {
    if (!row.assetKey || row.baseValue == null || row.baseValue <= 0) continue;
    map.set(row.assetKey, (map.get(row.assetKey) ?? 0) + (row.baseValue / portfolioBase) * 100);
  }
  return map;
}
