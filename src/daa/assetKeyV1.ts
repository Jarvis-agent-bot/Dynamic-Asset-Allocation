export function normalizeDaaSymbolV1(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export function normalizeDaaMarketV1(value: unknown, fallback = "US"): string {
  const market = String(value || "").trim().toUpperCase();
  if (!market) return fallback;
  if (market === "A") return "CN";
  return market;
}

export function normalizeDaaCurrencyCodeV1(value: unknown, fallback = "USD"): string {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return fallback;
  if (code === "RMB" || code === "CNH") return "CNY";
  return code;
}

export function buildDaaAssetKeyV1(symbol: unknown, market: unknown): string {
  const normalizedSymbol = normalizeDaaSymbolV1(symbol);
  const normalizedMarket = normalizeDaaMarketV1(market, "US");
  if (!normalizedSymbol) return "";
  return `${normalizedMarket}::${normalizedSymbol}`;
}

export function parseDaaAssetKeyV1(assetKey: unknown): { market: string; symbol: string } | null {
  const text = String(assetKey || "").trim().toUpperCase();
  if (!text) return null;
  const idx = text.indexOf("::");
  if (idx <= 0 || idx >= text.length - 2) return null;
  const market = normalizeDaaMarketV1(text.slice(0, idx), "US");
  const symbol = normalizeDaaSymbolV1(text.slice(idx + 2));
  if (!symbol) return null;
  return { market, symbol };
}
