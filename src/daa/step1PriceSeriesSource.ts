export type Step1PriceSeriesSource = "yfinance" | "okx";

/**
 * Heuristic v0: OKX symbols are usually BASE-QUOTE, e.g. "BTC-USDT".
 * Everything else defaults to yfinance (stocks/ETFs/HK tickers like "2800.HK").
 */
export function isOkxCryptoSymbol(symbolRaw: string): boolean {
  const s = String(symbolRaw || "").trim().toUpperCase();
  if (!s) return false;

  // OKX spot typically uses BASE-QUOTE. We treat common stable/fiat quotes as crypto.
  // Examples: BTC-USDT, ETH-USDC, BTC-USD.
  if (!s.includes("-")) return false;
  return /-(USDT|USDC|USD|HKD|EUR|JPY)$/.test(s);
}

export function inferStep1PriceSeriesSource(symbolRaw: string): Step1PriceSeriesSource {
  return isOkxCryptoSymbol(symbolRaw) ? "okx" : "yfinance";
}
