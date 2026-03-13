export function normalizeDaaSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export function normalizeDaaMarket(value: unknown, fallback = "US"): string {
  const market = String(value || "").trim().toUpperCase();
  if (!market) return fallback;
  if (market === "A") return "CN";
  return market;
}

export function normalizeDaaCurrencyCode(value: unknown, fallback = "USD"): string {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return fallback;
  if (code === "RMB" || code === "CNH") return "CNY";
  return code;
}

export function buildDaaAssetKey(symbol: unknown, market: unknown): string {
  const normalizedSymbol = normalizeDaaSymbol(symbol);
  const normalizedMarket = normalizeDaaMarket(market, "US");
  if (!normalizedSymbol) return "";
  return `${normalizedMarket}::${normalizedSymbol}`;
}

export function parseDaaAssetKey(assetKey: unknown): { market: string; symbol: string } | null {
  const text = String(assetKey || "").trim().toUpperCase();
  if (!text) return null;
  const idx = text.indexOf("::");
  if (idx <= 0 || idx >= text.length - 2) return null;
  const market = normalizeDaaMarket(text.slice(0, idx), "US");
  const symbol = normalizeDaaSymbol(text.slice(idx + 2));
  if (!symbol) return null;
  return { market, symbol };
}
