export function formatPercent(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "0.00%";
  return `${v.toFixed(digits)}%`;
}

export function formatNotional(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString();
}

export function formatCurrency(v: number, currency = "USD"): string {
  if (!Number.isFinite(v)) return "$0";
  const normalized = String(currency || "USD").trim().toUpperCase();
  const displayCurrency = normalized === "RMB" ? "CNY" : normalized;
  try {
    return v.toLocaleString("en-US", { style: "currency", currency: displayCurrency, maximumFractionDigits: 0 });
  } catch {
    return `${displayCurrency} ${Math.round(v).toLocaleString()}`;
  }
}

export function clampInput(min: number, value: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
