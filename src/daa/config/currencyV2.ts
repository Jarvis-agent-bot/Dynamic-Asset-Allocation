export type CurrencyCodeV2 = "USD" | "CNY" | "HKD";

const BASE_CURRENCY_SET_V2 = new Set<CurrencyCodeV2>(["USD", "CNY", "HKD"]);

function toUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export function normalizeCurrencyAliasV2(value: unknown, fallback = "USD"): string {
  const normalized = toUpper(value) || toUpper(fallback) || "USD";
  if (normalized === "RMB" || normalized === "CNH") return "CNY";
  return normalized;
}

export function normalizeBaseCurrencyCodeV2(value: unknown, fallback: CurrencyCodeV2 = "USD"): CurrencyCodeV2 {
  const aliased = normalizeCurrencyAliasV2(value, fallback);
  if (BASE_CURRENCY_SET_V2.has(aliased as CurrencyCodeV2)) {
    return aliased as CurrencyCodeV2;
  }
  return fallback;
}

export function normalizeCurrencyPairTokenV2(raw: unknown): string {
  const token = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "/");
  if (!token) return "";

  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(token)) {
    const [base, quote] = token.split("/");
    return `${normalizeCurrencyAliasV2(base)}/${normalizeCurrencyAliasV2(quote)}`;
  }

  return token;
}

export function normalizeCurrencyPairV2(base: unknown, quote: unknown): string {
  return `${normalizeCurrencyAliasV2(base)}/${normalizeCurrencyAliasV2(quote)}`;
}
