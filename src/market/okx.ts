import type { PriceBar } from "../core/domain";

export type OkxCandlesPayload = {
  code?: string;
  msg?: string;
  data?: unknown;
};

export type NormalizeOkxCandlesResult = { series: PriceBar[]; issues: string[] };

function asIsoDateFromMs(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize OKX `/api/v5/market/candles` response into our `PriceBar[]` contract.
 *
 * OKX returns rows in reverse chronological order. We sort ascending and de-dupe by `date`.
 */
export function normalizeOkxCandlesPayload(
  input: unknown,
  opts: { start?: string; end?: string } = {},
): NormalizeOkxCandlesResult {
  const issues: string[] = [];

  const arr: unknown[] = Array.isArray(input)
    ? input
    : Array.isArray((input as OkxCandlesPayload | null | undefined)?.data)
      ? (((input as OkxCandlesPayload).data as unknown[]) ?? [])
      : [];

  if (!arr.length) {
    return { series: [], issues: ["okx candles payload must be an array (or {data: [...]})"] };
  }

  // De-dupe by ISO date (OKX candles can include multiple bars per day depending on `bar`).
  const byDate = new Map<string, PriceBar>();

  for (let i = 0; i < arr.length; i++) {
    const row = arr[i];
    if (!Array.isArray(row)) {
      issues.push(`okx candles row #${i + 1} is not an array`);
      continue;
    }

    const tsRaw = row[0];
    const closeRaw = row[4];

    const ts = Number(tsRaw);
    const close = Number(closeRaw);

    if (!Number.isFinite(ts)) {
      issues.push(`okx candles row #${i + 1} has invalid timestamp: ${String(tsRaw)}`);
      continue;
    }
    if (!Number.isFinite(close) || close <= 0) {
      issues.push(`okx candles row #${i + 1} has invalid close: ${String(closeRaw)}`);
      continue;
    }

    const date = asIsoDateFromMs(ts);
    if (!date) {
      issues.push(`okx candles row #${i + 1} has invalid timestamp date: ${String(tsRaw)}`);
      continue;
    }

    // Keep the first-seen bar per date (OKX returns newest-first by default).
    if (!byDate.has(date)) {
      byDate.set(date, { date, close });
    }
  }

  const series = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const start = opts.start?.trim() || "";
  const end = opts.end?.trim() || "";
  const filtered = start || end ? series.filter((b) => (!start || b.date >= start) && (!end || b.date <= end)) : series;

  if (!filtered.length) issues.push("okx payload produced 0 bars (after normalization/range filter)");

  return { series: filtered, issues };
}
