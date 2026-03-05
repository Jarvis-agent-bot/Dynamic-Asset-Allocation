export type AssetClassV1 = "EQUITY" | "ETF" | "BOND" | "COMMODITY" | "CASH" | "CRYPTO" | "FUND" | "INDEX" | "OTHER";
export type RegionV1 = "US" | "HK" | "CN" | "EU" | "JP" | "GLOBAL" | "OTHER";
export type InstrumentTypeV1 = "STOCK" | "ETF" | "BOND" | "COMMODITY" | "CASH" | "CRYPTO" | "FUND" | "INDEX" | "OTHER";

export function normalizeAssetClassV1(value: unknown, fallback: AssetClassV1 = "OTHER"): AssetClassV1 {
  const v = String(value || "").trim().toUpperCase();
  if (v === "EQUITY" || v === "ETF" || v === "BOND" || v === "COMMODITY" || v === "CASH" || v === "CRYPTO" || v === "FUND" || v === "INDEX" || v === "OTHER") {
    return v;
  }
  return fallback;
}

export function normalizeRegionV1(value: unknown, fallback: RegionV1 = "GLOBAL"): RegionV1 {
  const v = String(value || "").trim().toUpperCase();
  if (v === "US" || v === "HK" || v === "CN" || v === "EU" || v === "JP" || v === "GLOBAL" || v === "OTHER") {
    return v;
  }
  return fallback;
}

export function normalizeInstrumentTypeV1(value: unknown, fallback: InstrumentTypeV1 = "OTHER"): InstrumentTypeV1 {
  const v = String(value || "").trim().toUpperCase();
  if (v === "STOCK" || v === "ETF" || v === "BOND" || v === "COMMODITY" || v === "CASH" || v === "CRYPTO" || v === "FUND" || v === "INDEX" || v === "OTHER") {
    return v;
  }
  return fallback;
}

export function inferRegionByMarketV1(marketRaw: unknown): RegionV1 {
  const market = String(marketRaw || "").trim().toUpperCase();
  if (market === "US") return "US";
  if (market === "HK") return "HK";
  if (market === "CN") return "CN";
  if (market === "JP") return "JP";
  if (market === "EU") return "EU";
  if (market === "CRYPTO") return "GLOBAL";
  return "GLOBAL";
}

export function inferMarketGroupV1(input: { market?: unknown; assetClass?: unknown }): string {
  const market = String(input.market || "").trim().toUpperCase() || "OTHER";
  const assetClass = normalizeAssetClassV1(input.assetClass, "OTHER");
  return `${market}_${assetClass}`;
}

export function inferAssetClassByQuoteTypeV1(input: { quoteType?: unknown; symbol?: unknown; market?: unknown }): AssetClassV1 {
  const quoteType = String(input.quoteType || "").trim().toUpperCase();
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const market = String(input.market || "").trim().toUpperCase();

  if (quoteType === "ETF") return "ETF";
  if (quoteType === "MUTUALFUND") return "FUND";
  if (quoteType === "INDEX") return "INDEX";
  if (quoteType === "CRYPTOCURRENCY" || symbol.includes("-USD") || market === "CRYPTO") return "CRYPTO";
  if (quoteType === "BOND") return "BOND";
  if (quoteType === "EQUITY") return "EQUITY";
  return "EQUITY";
}

export function inferInstrumentTypeByAssetClassV1(assetClassRaw: unknown): InstrumentTypeV1 {
  const assetClass = normalizeAssetClassV1(assetClassRaw, "OTHER");
  if (assetClass === "ETF") return "ETF";
  if (assetClass === "FUND") return "FUND";
  if (assetClass === "BOND") return "BOND";
  if (assetClass === "COMMODITY") return "COMMODITY";
  if (assetClass === "CASH") return "CASH";
  if (assetClass === "CRYPTO") return "CRYPTO";
  if (assetClass === "INDEX") return "INDEX";
  if (assetClass === "EQUITY") return "STOCK";
  return "OTHER";
}
