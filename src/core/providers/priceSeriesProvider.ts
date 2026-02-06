import type { PriceBar } from "../domain";
import { assertValidPriceSeries } from "../seriesContracts";

/**
 * Framework v0: minimal provider interface for supplying historical price series.
 *
 * Providers SHOULD return a fully-formed series that satisfies `assertValidPriceSeries`:
 * - >= 2 bars
 * - `date` in strict YYYY-MM-DD, valid calendar date, strictly increasing
 * - `close` finite and > 0
 */
export interface PriceSeriesProvider {
  getPriceSeries(request: PriceSeriesRequest): Promise<PriceBar[]>;
}

/**
 * Minimal request shape for framework v0.
 *
 * - `symbol` is the provider-specific ticker/identifier (e.g. "SPY", "QQQ").
 * - `start`/`end` are inclusive ISO dates (YYYY-MM-DD) when supported.
 */
export type PriceSeriesRequest = {
  symbol: string;
  start?: string;
  end?: string;
};

/**
 * Contract validation for framework v0 provider requests.
 */
export function assertValidPriceSeriesRequest(request: PriceSeriesRequest): void {
  if (!request || typeof request !== "object") throw new Error("request must be an object");

  const symbol = (request as PriceSeriesRequest).symbol;
  if (typeof symbol !== "string" || symbol.trim().length === 0) {
    throw new Error(`symbol must be a non-empty string (got ${String(symbol)})`);
  }

  const assertIsoDate: (d: unknown, label: string) => asserts d is string = (
    d,
    label,
  ) => {
    if (typeof d !== "string" || d.length === 0) {
      throw new Error(`${label} must be a non-empty string (got ${String(d)})`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error(`${label} must match YYYY-MM-DD (got ${d})`);
    }
    const parsed = new Date(`${d}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) {
      throw new Error(`${label} must be a valid calendar date (got ${d})`);
    }
  };

  const { start, end } = request;
  if (start !== undefined) assertIsoDate(start, "start");
  if (end !== undefined) assertIsoDate(end, "end");
  if (start && end && start > end) {
    throw new Error(`start must be <= end (got ${start} > ${end})`);
  }
}

/**
 * Convenience wrapper: fetch + validate so failures happen at the boundary.
 */
export async function fetchValidatedPriceSeries(
  provider: PriceSeriesProvider,
  request: PriceSeriesRequest,
): Promise<PriceBar[]> {
  assertValidPriceSeriesRequest(request);
  const series = await provider.getPriceSeries(request);
  assertValidPriceSeries(series);
  return series;
}
