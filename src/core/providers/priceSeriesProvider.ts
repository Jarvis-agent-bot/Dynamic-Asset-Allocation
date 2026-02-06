import type { PriceBar } from "../domain";
import { assertIsoDateString } from "../isoDate";
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
  /** Optional identifier used for error messages/logging (e.g. "stooq", "yahoo"). */
  name?: string;

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

  if (symbol.trim() !== symbol) {
    throw new Error(`symbol must not have leading/trailing whitespace (got ${JSON.stringify(symbol)})`);
  }

  const { start, end } = request;
  if (start !== undefined) assertIsoDateString(start, "start");
  if (end !== undefined) assertIsoDateString(end, "end");
  if (start && end && start > end) {
    throw new Error(`start must be <= end (got ${start} > ${end})`);
  }
}

/**
 * Optional contract check: if a request includes `start`/`end`, validate that the
 * provider response respects that inclusive range.
 *
 * Note: this is intentionally opt-in. Some providers may ignore date ranges and
 * return a wider window; consumers can choose whether to enforce.
 */
export function assertPriceSeriesRespectsRequestRange(
  series: Array<Pick<PriceBar, "date">>,
  request: Pick<PriceSeriesRequest, "start" | "end">,
): void {
  const { start, end } = request;
  if (!start && !end) return;

  for (let i = 0; i < series.length; i++) {
    const d = series[i]?.date;

    if (typeof d !== "string" || d.length === 0) {
      throw new Error(`series date must be a non-empty YYYY-MM-DD string (got ${String(d)} at index ${i})`);
    }

    // Strict ISO check (YYYY-MM-DD) + validity (e.g., rejects 2026-13-40).
    try {
      assertIsoDateString(d, "series date");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${msg} at index ${i}`);
    }

    if (start && d < start) {
      throw new Error(`series contains date before start (start=${start}, got ${d} at index ${i})`);
    }
    if (end && d > end) {
      throw new Error(`series contains date after end (end=${end}, got ${d} at index ${i})`);
    }
  }
}

export class PriceSeriesProviderError extends Error {
  readonly providerName: string;
  readonly request: PriceSeriesRequest;

  constructor(opts: { providerName: string; request: PriceSeriesRequest; message: string; cause?: unknown }) {
    super(opts.message, { cause: opts.cause });
    this.name = "PriceSeriesProviderError";
    // Ensure instanceof works reliably even when transpiled.
    Object.setPrototypeOf(this, new.target.prototype);

    this.providerName = opts.providerName;
    this.request = opts.request;
  }
}

export async function fetchValidatedPriceSeries(
  provider: PriceSeriesProvider,
  request: PriceSeriesRequest,
): Promise<PriceBar[]> {
  assertValidPriceSeriesRequest(request);

  const providerName = provider.name ?? "(anonymous)";
  const reqStr = `symbol=${request.symbol}`
    + (request.start ? ` start=${request.start}` : "")
    + (request.end ? ` end=${request.end}` : "");

  try {
    const series = await provider.getPriceSeries(request);
    assertValidPriceSeries(series);
    return series;
  } catch (err) {
    // Avoid double-wrapping if a downstream helper/provider already threw our
    // structured error.
    if (err instanceof PriceSeriesProviderError) {
      throw err;
    }

    const msg = err instanceof Error ? err.message : String(err);
    throw new PriceSeriesProviderError({
      providerName,
      request,
      message: `PriceSeriesProvider ${providerName} failed (${reqStr}): ${msg}`,
      cause: err,
    });
  }
}

/**
 * Variant of `fetchValidatedPriceSeries` that also enforces that, when the caller
 * requests a `start`/`end` range, the provider response stays within that
 * inclusive window.
 */
export async function fetchValidatedPriceSeriesEnforcingRange(
  provider: PriceSeriesProvider,
  request: PriceSeriesRequest,
): Promise<PriceBar[]> {
  const series = await fetchValidatedPriceSeries(provider, request);
  assertPriceSeriesRespectsRequestRange(series, request);
  return series;
}
