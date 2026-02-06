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
 * Convenience wrapper: fetch + validate so failures happen at the boundary.
 */
export async function fetchValidatedPriceSeries(
  provider: PriceSeriesProvider,
  request: PriceSeriesRequest,
): Promise<PriceBar[]> {
  const series = await provider.getPriceSeries(request);
  assertValidPriceSeries(series);
  return series;
}
