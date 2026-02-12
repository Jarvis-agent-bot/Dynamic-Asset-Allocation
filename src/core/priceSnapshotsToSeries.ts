import type { PriceBar } from "./domain";

import { assertValidSeriesDates } from "./seriesContracts";

export type PriceSnapshotV0 = {
  /** Accept either YYYY-MM-DD or an ISO datetime; v0 normalizes to YYYY-MM-DD. */
  date: string;
  /** Symbol -> price, or Symbol -> {price}. Also accepts [{symbol,price}]. */
  prices: unknown;
};

function normalizeIsoDate(isoLike: unknown): string {
  const s = String(isoLike ?? "").trim();
  // Accept ISO datetime and normalize to YYYY-MM-DD.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m && m[1]) return m[1];
  throw new Error(`invalid snapshot date: ${String(isoLike)}`);
}

function toFinitePositiveNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeSymbol(sym: unknown): string {
  return String(sym ?? "").trim().toUpperCase();
}

function normalizePricesLike(x: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!x) return out;

  // Accept [{symbol, price}] rows.
  if (Array.isArray(x)) {
    for (const row of x) {
      if (!row || typeof row !== "object") continue;
      const r: any = row as any;
      const sym = normalizeSymbol(r.symbol ?? r.id ?? r.ticker);
      const px = toFinitePositiveNumber(r.price ?? r.close);
      if (!sym || px === null) continue;
      out[sym] = px;
    }
    return out;
  }

  // Accept map form:
  // - { SPY: 123.4 }
  // - { SPY: { price: 123.4 } }
  if (typeof x === "object") {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      const sym = normalizeSymbol(k);
      if (!sym) continue;

      const px = (() => {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          return toFinitePositiveNumber((v as any).price ?? (v as any).close);
        }
        return toFinitePositiveNumber(v);
      })();

      if (px === null) continue;
      out[sym] = px;
    }
  }

  return out;
}

export function snapshotsToSeriesBySymbol(
  snapshots: PriceSnapshotV0[],
  opts?: {
    /** v0 default: require that every snapshot contains every symbol. */
    requireCompleteSymbols?: boolean;
  },
): { seriesBySymbol: Record<string, PriceBar[]>; symbols: string[]; dates: string[] } {
  const requireCompleteSymbols = opts?.requireCompleteSymbols ?? true;

  const rows = (snapshots || [])
    .filter(Boolean)
    .map((s) => ({ date: normalizeIsoDate((s as any)?.date), prices: normalizePricesLike((s as any)?.prices) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (rows.length < 2) throw new Error("need >= 2 snapshots");

  const symSet = new Set<string>();
  for (const r of rows) {
    for (const sym of Object.keys(r.prices)) symSet.add(sym);
  }
  const symbols = Array.from(symSet).sort();
  if (!symbols.length) throw new Error("no symbols found in snapshots");

  if (requireCompleteSymbols) {
    for (const r of rows) {
      for (const sym of symbols) {
        if (!Number.isFinite(r.prices[sym])) {
          throw new Error(`snapshot ${r.date} missing price for ${sym}`);
        }
      }
    }
  }

  const seriesBySymbol: Record<string, PriceBar[]> = {};
  for (const sym of symbols) seriesBySymbol[sym] = [];

  for (const r of rows) {
    for (const sym of symbols) {
      const px = r.prices[sym];
      if (!Number.isFinite(px) || px <= 0) {
        // When requireCompleteSymbols=false, skip missing prices.
        continue;
      }
      seriesBySymbol[sym].push({ date: r.date, close: px });
    }
  }

  const dates = rows.map((r) => r.date);

  // Validate per-series dates (also catches malformed YYYY-MM-DD).
  for (const sym of symbols) assertValidSeriesDates(seriesBySymbol[sym]);

  // v0 contract: aligned series (same dates/length). This is required by drift simulator.
  const expectedLen = dates.length;
  for (const sym of symbols) {
    const s = seriesBySymbol[sym];
    if (s.length !== expectedLen) {
      throw new Error(`series length mismatch after normalization: ${sym} expected=${expectedLen} got=${s.length}`);
    }
    for (let i = 0; i < expectedLen; i++) {
      if (s[i]?.date !== dates[i]) {
        throw new Error(`series date mismatch after normalization: ${sym} at i=${i} expected=${dates[i]} got=${String(s[i]?.date)}`);
      }
    }
  }

  return { seriesBySymbol, symbols, dates };
}

export function coerceSeriesBySymbolInput(x: unknown): Record<string, PriceBar[]> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};

  // Accept either {seriesBySymbol: {...}} or the raw map itself.
  const raw = (x as any).seriesBySymbol ?? (x as any).series_by_symbol ?? x;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: Record<string, PriceBar[]> = {};
  for (const [symRaw, seriesRaw] of Object.entries(raw as Record<string, unknown>)) {
    const sym = normalizeSymbol(symRaw);
    if (!sym) continue;
    if (!Array.isArray(seriesRaw)) continue;

    const series: PriceBar[] = [];
    for (const row of seriesRaw) {
      if (!row || typeof row !== "object") continue;
      const r: any = row as any;
      const date = normalizeIsoDate(r.date);
      const close = toFinitePositiveNumber(r.close ?? r.price);
      if (!date || close === null) continue;
      series.push({ date, close });
    }

    if (series.length) out[sym] = series;
  }

  return out;
}
