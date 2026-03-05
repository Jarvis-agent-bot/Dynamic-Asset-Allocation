import {
  buildDaaAssetKeyV1,
  normalizeDaaCurrencyCodeV1,
} from "@/src/daa/assetKeyV1";

export type DaaFxRateLikeV1 = {
  baseCcy?: unknown;
  quoteCcy?: unknown;
  rate?: unknown;
};

export type DaaPositionLikeV1 = {
  symbol?: unknown;
  market?: unknown;
  currency?: unknown;
  qty?: unknown;
  price?: unknown;
};

export type DaaPositionValuationRowV1 = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  localValue: number;
  baseValue: number | null;
  fxMissing: boolean;
};

export function buildFxLookupToBaseV1(rows: DaaFxRateLikeV1[]): Map<string, number> {
  const output = new Map<string, number>();
  for (const row of rows) {
    const base = normalizeDaaCurrencyCodeV1(row.baseCcy, "");
    const quote = normalizeDaaCurrencyCodeV1(row.quoteCcy, "");
    const rate = Number(row.rate);
    if (!base || !quote || !Number.isFinite(rate) || rate <= 0) continue;
    output.set(`${base}/${quote}`, rate);
  }
  return output;
}

export function resolveFxRateToBaseV1(
  baseCurrency: string,
  localCurrency: unknown,
  fxLookup: Map<string, number>,
): number | null {
  const base = normalizeDaaCurrencyCodeV1(baseCurrency, "USD");
  const local = normalizeDaaCurrencyCodeV1(localCurrency, base);
  if (local === base) return 1;
  const direct = fxLookup.get(`${local}/${base}`);
  if (direct && direct > 0) return direct;
  const reverse = fxLookup.get(`${base}/${local}`);
  if (reverse && reverse > 0) return 1 / reverse;
  return null;
}

export function buildPositionValuationRowsV1(
  positions: DaaPositionLikeV1[],
  baseCurrency: string,
  fxLookup: Map<string, number>,
): DaaPositionValuationRowV1[] {
  return positions.map((position) => {
    const symbol = String(position.symbol || "").trim().toUpperCase();
    const market = String(position.market || "US").trim().toUpperCase() || "US";
    const currency = normalizeDaaCurrencyCodeV1(position.currency, baseCurrency);
    const localValue = Number(position.qty || 0) * Number(position.price || 0);
    const fxRate = resolveFxRateToBaseV1(baseCurrency, currency, fxLookup);
    const baseValue = fxRate != null ? localValue * fxRate : null;
    return {
      assetKey: buildDaaAssetKeyV1(symbol, market),
      symbol,
      market,
      currency,
      localValue,
      baseValue,
      fxMissing: localValue > 0 && baseValue == null,
    };
  });
}

export function buildActualWeightMapV1(
  valuationRows: DaaPositionValuationRowV1[],
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

export function buildHoldingQtyMapV1(positions: DaaPositionLikeV1[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of positions) {
    const key = buildDaaAssetKeyV1(row.symbol, row.market);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + Number(row.qty || 0));
  }
  return map;
}
