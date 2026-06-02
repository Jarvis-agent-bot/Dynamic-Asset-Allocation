import type { PriceBar } from "../core/domain";

type NormalizeYfinanceHistoricalQuotesResult = { series: PriceBar[]; issues: string[] };

export function normalizeYfinanceSymbol(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";

  // Convenience: allow users to type HK tickers as 4 digits (e.g. 2800 -> 2800.HK).
  if (/^\d{4}$/.test(s)) return `${s}.HK`;

  return s.toUpperCase();
}

export function addDaysIsoUtc(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function asIsoPoint(x: unknown, interval: "1d" | "1h" = "1d"): string {
  if (x instanceof Date) {
    const t = x.getTime();
    if (!Number.isFinite(t)) return "";
    const iso = x.toISOString();
    return interval === "1h" ? iso : iso.slice(0, 10);
  }

  // yahoo-finance2 sometimes serializes as ISO strings.
  if (typeof x === "string") {
    // Accept YYYY-MM-DD or full ISO; daily normalizes to date, hourly preserves the timestamp.
    if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return interval === "1h" ? `${x}T00:00:00.000Z` : x;
    const d = new Date(x);
    if (!Number.isFinite(d.getTime())) return "";
    const iso = d.toISOString();
    return interval === "1h" ? iso : iso.slice(0, 10);
  }

  return "";
}

type YahooFinanceHistoricalQuoteLike = {
  date?: unknown;
  close?: unknown;
  adjClose?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  volume?: unknown;
};

/**
 * Normalize yahoo-finance2/yfinance-like historical quotes into our `PriceBar[]` contract.
 *
 * - De-dupes by ISO date
 * - Sorts ascending
 * - Filters to inclusive [start, end] when provided
 */
export function normalizeYfinanceHistoricalQuotes(
  input: unknown,
  opts: { start?: string; end?: string; interval?: "1d" | "1h" } = {},
): NormalizeYfinanceHistoricalQuotesResult {
  const issues: string[] = [];
  const interval = opts.interval === "1h" ? "1h" : "1d";

  const arr: unknown[] = Array.isArray(input) ? input : [];
  if (!arr.length) {
    return { series: [], issues: ["yfinance historical payload must be an array"] };
  }

  const byDate = new Map<string, PriceBar>();

  for (let i = 0; i < arr.length; i++) {
    const row = arr[i] as YahooFinanceHistoricalQuoteLike;
    if (!row || typeof row !== "object") {
      issues.push(`yfinance quote #${i + 1} is not an object`);
      continue;
    }

    const date = asIsoPoint(row.date, interval);
    if (!date) {
      issues.push(`yfinance quote #${i + 1} has invalid date: ${String(row.date)}`);
      continue;
    }

    // Prefer regular close; fall back to adjClose when close is missing.
    const closeRaw = row.close ?? row.adjClose;
    const close = Number(closeRaw);
    if (!Number.isFinite(close) || close <= 0) {
      issues.push(`yfinance quote #${i + 1} has invalid close: ${String(closeRaw)}`);
      continue;
    }

    if (!byDate.has(date)) {
      const bar: PriceBar = { date, close };
      const openVal = Number(row.open);
      if (Number.isFinite(openVal) && openVal > 0) bar.open = openVal;
      const highVal = Number(row.high);
      if (Number.isFinite(highVal) && highVal > 0) bar.high = highVal;
      const lowVal = Number(row.low);
      if (Number.isFinite(lowVal) && lowVal > 0) bar.low = lowVal;
      const volVal = Number(row.volume);
      if (Number.isFinite(volVal) && volVal >= 0) bar.volume = volVal;
      byDate.set(date, bar);
    }
  }

  const series = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const start = opts.start?.trim() || "";
  const end = opts.end?.trim() || "";
  const filtered = start || end ? series.filter((b) => (!start || b.date >= start) && (!end || b.date <= end)) : series;

  if (!filtered.length) issues.push("yfinance payload produced 0 bars (after normalization/range filter)");

  return { series: filtered, issues };
}
