import type { PriceBar } from "../domain";

import type { PriceSeriesProvider, PriceSeriesRequest } from "./priceSeriesProvider";

type OkxCandlesApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  series?: PriceBar[];
  issues?: string[];
};

/**
 * Client-side provider that fetches normalized candles from our Next.js API route.
 *
 * Note: this intentionally depends on our app route (same-origin) instead of
 * calling OKX directly, to avoid CORS and to centralize normalization.
 */
export function createOkxPublicPriceSeriesProvider(opts: { endpointBase?: string; bar?: string } = {}): PriceSeriesProvider {
  return {
    name: "okx-public",
    async getPriceSeries(request: PriceSeriesRequest): Promise<PriceBar[]> {
      const qs = new URLSearchParams();
      qs.set("instId", request.symbol);
      qs.set("bar", opts.bar ?? "1D");
      if (request.start) qs.set("start", request.start);
      if (request.end) qs.set("end", request.end);

      const base = (opts.endpointBase ?? "").replace(/\/$/, "");
      const url = `${base}/api/daa/market/okx/candles?${qs.toString()}`;

      const r = await fetch(url, { method: "GET" });
      const text = await r.text();

      let payload: OkxCandlesApiResponse = {};
      try {
        payload = JSON.parse(text) as OkxCandlesApiResponse;
      } catch {
        payload = { error: "invalid JSON from okx candles route", message: text.slice(0, 300) };
      }

      if (!r.ok || !payload.ok) {
        const msg = payload?.error || payload?.message || `HTTP ${r.status}`;
        throw new Error(`OKX candles route failed: ${msg}`);
      }

      const series = Array.isArray(payload.series) ? payload.series : [];
      if (!series.length) {
        const issues = Array.isArray(payload.issues) ? payload.issues.join("; ") : "";
        throw new Error(`OKX candles route returned empty series${issues ? ` (${issues})` : ""}`);
      }

      return series;
    },
  };
}
