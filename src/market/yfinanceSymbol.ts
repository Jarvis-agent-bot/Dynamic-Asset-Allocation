import { normalizeYfinanceSymbol } from "@/src/market/yfinance";

function normalizeMarket(value: unknown): string {
  return String(value || "").trim().toUpperCase() || "US";
}

export function toYfinanceSymbolByMarket(symbolRaw: string, marketRaw: string): string {
  const symbol = String(symbolRaw || "").trim().toUpperCase();
  if (!symbol) return "";

  const market = normalizeMarket(marketRaw);
  if (market === "HK") {
    if (symbol.endsWith(".HK")) return symbol;
    if (/^\d{1,5}$/.test(symbol)) return `${symbol.padStart(4, "0")}.HK`;
  }

  if (market === "CN") {
    if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return symbol;
    if (/^\d{6}$/.test(symbol)) return symbol.startsWith("6") ? `${symbol}.SS` : `${symbol}.SZ`;
  }

  if (market === "KR") {
    if (symbol.endsWith(".KS") || symbol.endsWith(".KQ")) return symbol;
    if (/^\d{6}$/.test(symbol)) return `${symbol}.KS`;
  }

  if (market === "TW") {
    if (symbol.endsWith(".TW") || symbol.endsWith(".TWO")) return symbol;
    if (/^\d{4}$/.test(symbol)) return `${symbol}.TW`;
  }

  if (market === "JP") {
    if (symbol.endsWith(".T")) return symbol;
    if (/^\d{4}$/.test(symbol)) return `${symbol}.T`;
  }

  if (market === "COMMODITY") return symbol;

  return normalizeYfinanceSymbol(symbol);
}
