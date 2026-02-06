import type { PriceBar } from "./domain";

/**
 * Contract: series dates must be present, ISO-like (YYYY-MM-DD), valid calendar dates,
 * and strictly increasing.
 *
 * We rely on lexicographic ordering/alignment between weights[i] and return[i->i+1];
 * missing/out-of-order or non-ISO dates would silently degrade backtests/signals.
 */
export function assertValidSeriesDates(series: Array<Pick<PriceBar, "date">>): void {
  for (let i = 0; i < series.length; i++) {
    const d = series[i]?.date;
    if (typeof d !== "string" || d.length === 0) {
      throw new Error(`Price series date must be a non-empty string (got ${String(d)} at index ${i})`);
    }

    // Strict-ish ISO check (YYYY-MM-DD) + validity (e.g., rejects 2026-13-40).
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error(`Price series date must match YYYY-MM-DD (got ${d} at index ${i})`);
    }
    const parsed = new Date(`${d}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) {
      throw new Error(`Price series date must be a valid calendar date (got ${d} at index ${i})`);
    }

    if (i > 0) {
      const prev = series[i - 1]?.date;
      if (typeof prev === "string" && d <= prev) {
        throw new Error(`Price series dates must be strictly increasing (got ${prev} then ${d} at index ${i})`);
      }
    }
  }
}

/**
 * Provider contract (framework v0): a price series must be well-formed enough to
 * power signals/backtests without relying on "forgiving" fallbacks.
 *
 * Note: backtest code still contains defensive handling for bad data, but pipelines
 * should validate early so failures are loud and actionable.
 */
export function assertValidPriceSeries(series: PriceBar[]): void {
  if (!series || series.length < 2) throw new Error("series too short (need >= 2 bars)");

  assertValidSeriesDates(series);

  for (let i = 0; i < series.length; i++) {
    const close = Number(series[i]?.close);
    if (!Number.isFinite(close)) {
      throw new Error(`Price series close must be a finite number (got ${String(series[i]?.close)} at index ${i})`);
    }
    if (close <= 0) {
      throw new Error(`Price series close must be > 0 (got ${close} at index ${i})`);
    }
  }
}
