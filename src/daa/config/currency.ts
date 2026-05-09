export type CurrencyCode = "USD" | "CNY" | "HKD";

const BASE_CURRENCY_SET_ = new Set<CurrencyCode>(["USD", "CNY", "HKD"]);

function toUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export function normalizeCurrencyAlias(value: unknown, fallback = "USD"): string {
  const normalized = toUpper(value) || toUpper(fallback) || "USD";
  if (normalized === "RMB" || normalized === "CNH") return "CNY";
  return normalized;
}

export function normalizeBaseCurrencyCode(value: unknown, fallback: CurrencyCode = "USD"): CurrencyCode {
  const aliased = normalizeCurrencyAlias(value, fallback);
  if (BASE_CURRENCY_SET_.has(aliased as CurrencyCode)) {
    return aliased as CurrencyCode;
  }
  return fallback;
}

export function normalizeCurrencyPairToken(raw: unknown): string {
  const token = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "/");
  if (!token) return "";

  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(token)) {
    const [base, quote] = token.split("/");
    return `${normalizeCurrencyAlias(base)}/${normalizeCurrencyAlias(quote)}`;
  }

  return token;
}
