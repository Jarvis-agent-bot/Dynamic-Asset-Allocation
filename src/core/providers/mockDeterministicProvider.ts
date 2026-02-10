import type { PriceBar } from "../domain";

import type { PriceSeriesProvider, PriceSeriesRequest } from "./priceSeriesProvider";

function parseISODateUtc(iso: string): Date | null {
  // Expect YYYY-MM-DD. Use UTC to avoid timezone drift.
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtISODateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function addDaysUtc(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export type DeterministicMockProviderOptions = {
  /** Max number of days returned (inclusive endpoints). Default: 200. */
  maxDays?: number;
};

/**
 * Framework v0 helper: a deterministic in-memory provider so UI can ship before
 * real market-data ingestion exists.
 */
export function createDeterministicMockPriceSeriesProvider(
  opts: DeterministicMockProviderOptions = {},
): PriceSeriesProvider {
  const maxDays = Number.isFinite(opts.maxDays) ? Number(opts.maxDays) : 200;

  return {
    name: "mock-deterministic",
    async getPriceSeries(request: PriceSeriesRequest): Promise<PriceBar[]> {
      const symbol = String(request.symbol || "").toUpperCase();
      const start = request.start;
      const end = request.end;

      if (!start || !end) {
        throw new Error("mock provider requires start/end for deterministic range");
      }

      const s = parseISODateUtc(start);
      const e = parseISODateUtc(end);
      if (!s || !e || e < s) {
        throw new Error(`invalid date range: ${String(start)} -> ${String(end)}`);
      }

      const seed = symbol;
      const base = 100 + (seed.length % 7) * 0.5;

      const out: PriceBar[] = [];
      for (let i = 0; i <= maxDays; i++) {
        const d = addDaysUtc(s, i);
        if (d > e) break;
        const wobble = (i % 5) * 0.12;
        out.push({ date: fmtISODateUtc(d), close: base + i * 0.03 + wobble });
      }

      return out;
    },
  };
}
