import {
  buildDaaAssetKey,
  normalizeDaaCurrencyCode,
} from "@/src/daa/assetKey";

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
  fxMissing: boolean;
};

export type DaaMarkToMarketValuationRow = DaaPositionValuationRow & {
  markPrice: number;
  markPriceSource: "last_price" | "holding_price" | "missing";
};

export function buildFxLookupToBase(rows: DaaFxRateLike[]): Map<string, number> {
  const output = new Map<string, number>();
  for (const row of rows) {
    const base = normalizeDaaCurrencyCode(row.baseCcy, "");
    const quote = normalizeDaaCurrencyCode(row.quoteCcy, "");
    const rate = Number(row.rate);
    if (!base || !quote || !Number.isFinite(rate) || rate <= 0) continue;
    output.set(`${base}/${quote}`, rate);
  }
  return output;
}

export function resolveFxRateToBase(
  baseCurrency: string,
  localCurrency: unknown,
  fxLookup: Map<string, number>,
): number | null {
  const base = normalizeDaaCurrencyCode(baseCurrency, "USD");
  const local = normalizeDaaCurrencyCode(localCurrency, base);
  if (local === base) return 1;
  const direct = fxLookup.get(`${local}/${base}`);
  if (direct && direct > 0) return direct;
  const reverse = fxLookup.get(`${base}/${local}`);
  if (reverse && reverse > 0) return 1 / reverse;
  return null;
}

export function buildPositionValuationRows(
  positions: DaaPositionLike[],
  baseCurrency: string,
  fxLookup: Map<string, number>,
): DaaPositionValuationRow[] {
  return positions.map((position) => {
    const symbol = String(position.symbol || "").trim().toUpperCase();
    const market = String(position.market || "US").trim().toUpperCase() || "US";
    const currency = normalizeDaaCurrencyCode(position.currency, baseCurrency);
    const localValue = Number(position.qty || 0) * Number(position.price || 0);
    const fxRate = resolveFxRateToBase(baseCurrency, currency, fxLookup);
    const baseValue = fxRate != null ? localValue * fxRate : null;
    return {
      assetKey: buildDaaAssetKey(symbol, market),
      symbol,
      market,
      currency,
      localValue,
      baseValue,
      fxMissing: localValue > 0 && baseValue == null,
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
  fxLookup: Map<string, number>,
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
  fxLookup: Map<string, number>;
}): {
  rows: DaaMarkToMarketValuationRow[];
  holdingsValue: number;
  totalEquity: number;
} {
  const rows = buildMarkToMarketValuationRows(input.positions, input.baseCurrency, input.fxLookup);
  const holdingsValue = rows.reduce((sum, row) => sum + (row.baseValue ?? 0), 0);
  const cash = Math.max(0, Number(input.cash) || 0);
  return {
    rows,
    holdingsValue,
    totalEquity: holdingsValue + cash,
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

export function buildHoldingQtyMap(positions: DaaPositionLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of positions) {
    const key = buildDaaAssetKey(row.symbol, row.market);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + Number(row.qty || 0));
  }
  return map;
}
