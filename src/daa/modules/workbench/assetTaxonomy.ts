export type AssetClass = "EQUITY" | "ETF" | "BOND" | "COMMODITY" | "CASH" | "CRYPTO" | "FUND" | "INDEX" | "OTHER";
export type Region = "US" | "HK" | "CN" | "EU" | "JP" | "GLOBAL" | "OTHER";
export type InstrumentType = "STOCK" | "ETF" | "BOND" | "COMMODITY" | "CASH" | "CRYPTO" | "FUND" | "INDEX" | "OTHER";

export function normalizeAssetClass(value: unknown, fallback: AssetClass = "OTHER"): AssetClass {
  const v = String(value || "").trim().toUpperCase();
  if (v === "EQUITY" || v === "ETF" || v === "BOND" || v === "COMMODITY" || v === "CASH" || v === "CRYPTO" || v === "FUND" || v === "INDEX" || v === "OTHER") {
    return v;
  }
  return fallback;
}

export function normalizeRegion(value: unknown, fallback: Region = "GLOBAL"): Region {
  const v = String(value || "").trim().toUpperCase();
  if (v === "US" || v === "HK" || v === "CN" || v === "EU" || v === "JP" || v === "GLOBAL" || v === "OTHER") {
    return v;
  }
  return fallback;
}

export function normalizeInstrumentType(value: unknown, fallback: InstrumentType = "OTHER"): InstrumentType {
  const v = String(value || "").trim().toUpperCase();
  if (v === "STOCK" || v === "ETF" || v === "BOND" || v === "COMMODITY" || v === "CASH" || v === "CRYPTO" || v === "FUND" || v === "INDEX" || v === "OTHER") {
    return v;
  }
  return fallback;
}

export function inferRegionByMarket(marketRaw: unknown): Region {
  const market = String(marketRaw || "").trim().toUpperCase();
  if (market === "US") return "US";
  if (market === "HK") return "HK";
  if (market === "CN") return "CN";
  if (market === "JP") return "JP";
  if (market === "EU") return "EU";
  if (market === "CRYPTO") return "GLOBAL";
  return "GLOBAL";
}

export function inferMarketGroup(input: { market?: unknown; assetClass?: unknown }): string {
  const market = String(input.market || "").trim().toUpperCase() || "OTHER";
  const assetClass = normalizeAssetClass(input.assetClass, "OTHER");
  return `${market}_${assetClass}`;
}

export function inferAssetClassByQuoteType(input: { quoteType?: unknown; symbol?: unknown; market?: unknown }): AssetClass {
  const quoteType = String(input.quoteType || "").trim().toUpperCase();
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const market = String(input.market || "").trim().toUpperCase();

  if (quoteType === "COMMODITY") return "COMMODITY";
  if (/GC=F|SI=F|CL=F|BZ=F|HG=F|NG=F|XAU|XAG/.test(symbol)) return "COMMODITY";
  if (quoteType === "ETF") return "ETF";
  if (quoteType === "MUTUALFUND") return "FUND";
  if (quoteType === "INDEX") return "INDEX";
  if (quoteType === "CRYPTOCURRENCY" || symbol.includes("-USD") || market === "CRYPTO") return "CRYPTO";
  if (quoteType === "BOND") return "BOND";
  if (quoteType === "EQUITY") return "EQUITY";
  return "EQUITY";
}

export function inferInstrumentTypeByAssetClass(assetClassRaw: unknown): InstrumentType {
  const assetClass = normalizeAssetClass(assetClassRaw, "OTHER");
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
