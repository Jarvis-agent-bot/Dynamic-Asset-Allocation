import type { PriceBar } from "../domain";

import type { PriceSeriesProvider, PriceSeriesRequest } from "./priceSeriesProvider";

type YfinancePriceSeriesApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  series?: PriceBar[];
  issues?: string[];
};

/**
 * Client-side provider that fetches daily historical bars from our Next.js API route.
 *
 * This keeps the core backtest logic independent of direct Yahoo Finance calls (CORS).
 */
export function createYfinancePublicPriceSeriesProvider(opts: { endpointBase?: string } = {}): PriceSeriesProvider {
  return {
    name: "yfinance",
    async getPriceSeries(request: PriceSeriesRequest): Promise<PriceBar[]> {
      const qs = new URLSearchParams();
      qs.set("symbol", String(request.symbol || "").trim());
      if (request.start) qs.set("start", request.start);
      if (request.end) qs.set("end", request.end);

      const base = (opts.endpointBase ?? "").replace(/\/$/, "");
      const url = `${base}/api/daa/market/yfinance/price-series?${qs.toString()}`;

      const r = await fetch(url, { method: "GET" });
      const text = await r.text();

      let payload: YfinancePriceSeriesApiResponse = {};
      try {
        payload = JSON.parse(text) as YfinancePriceSeriesApiResponse;
      } catch {
        payload = { ok: false, error: "invalid JSON from yfinance price-series route", message: text.slice(0, 300) };
      }

      if (!r.ok || !payload.ok) {
        const msg = payload?.error || payload?.message || `HTTP ${r.status}`;
        throw new Error(`yfinance price-series route failed: ${msg}`);
      }

      const series = Array.isArray(payload.series) ? payload.series : [];
      if (!series.length) {
        const issues = Array.isArray(payload.issues) ? payload.issues.join("; ") : "";
        throw new Error(`yfinance price-series route returned empty series${issues ? ` (${issues})` : ""}`);
      }

      return series;
    },
  };
}
