import type { PriceBar } from "../domain";

import { createMarketDataClient } from "../../market/marketDataClient";

import type { PriceSeriesProvider, PriceSeriesRequest } from "./priceSeriesProvider";

/**
 * Client-side provider that fetches daily historical bars from our Next.js API route.
 *
 * This keeps the core backtest logic independent of direct Yahoo Finance calls (CORS).
 */
export function createYfinancePublicPriceSeriesProvider(opts: { endpointBase?: string } = {}): PriceSeriesProvider {
  const marketData = createMarketDataClient({ endpointBase: opts.endpointBase });

  return {
    name: "yfinance",
    async getPriceSeries(request: PriceSeriesRequest): Promise<PriceBar[]> {
      return marketData.yfinance.priceSeriesBars({
        symbol: String(request.symbol || "").trim(),
        start: request.start,
        end: request.end,
      });
    },
  };
}
