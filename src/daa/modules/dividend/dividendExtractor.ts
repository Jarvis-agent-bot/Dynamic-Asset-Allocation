import { daaPgPool } from "@/src/daa/pg/daaPg";
import { upsertDividendRecords } from "./dividendService";

type YahooChartDividend = {
  date: number;     // unix timestamp
  amount: number;   // dividend per share
};

/**
 * Extract dividend events from stored Yahoo Finance raw payloads.
 * Scans the daa_external_payload_raw_v1 table for chart responses that contain dividend events.
 */
export async function extractDividendsFromRawPayloads(input: {
  symbols?: string[];
  sinceDays?: number;
}): Promise<{ extracted: number; symbols: string[] }> {
  const pool = daaPgPool();
  const sinceDays = input.sinceDays ?? 30;
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  // Check if the raw payload table exists
  const { rows: tableCheck } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'daa_external_payload_raw_v1' LIMIT 1`,
  );
  if (tableCheck.length === 0) return { extracted: 0, symbols: [] };

  const symbolFilter = input.symbols && input.symbols.length > 0
    ? `AND symbol = ANY($2)`
    : "";
  const params: unknown[] = [cutoff];
  if (input.symbols && input.symbols.length > 0) {
    params.push(input.symbols.map((s) => s.toUpperCase()));
  }

  const { rows } = await pool.query(
    `SELECT id, symbol, market, payload_json, fetched_at
     FROM daa_external_payload_raw_v1
     WHERE fetched_at >= $1::timestamptz
       AND provider = 'yfinance'
       ${symbolFilter}
     ORDER BY fetched_at DESC`,
    params,
  );

  const allRecords: {
    symbol: string;
    market: string;
    exDate: string;
    payDate?: string | null;
    amount: number;
    currency: string;
    source: string;
  }[] = [];

  const symbolsFound = new Set<string>();

  for (const row of rows) {
    try {
      const payload = typeof row.payload_json === "string"
        ? JSON.parse(row.payload_json)
        : row.payload_json;

      const chartResult = payload?.chart?.result?.[0];
      if (!chartResult) continue;

      const dividends: Record<string, YahooChartDividend> = chartResult?.events?.dividends || {};
      const meta = chartResult?.meta || {};
      const currency = String(meta.currency || "USD").toUpperCase();

      for (const [, div] of Object.entries(dividends)) {
        if (!(div.amount > 0) || !div.date) continue;
        const exDate = new Date(div.date * 1000).toISOString().slice(0, 10);
        allRecords.push({
          symbol: String(row.symbol).toUpperCase(),
          market: String(row.market).toUpperCase(),
          exDate,
          amount: div.amount,
          currency,
          source: "yfinance",
        });
        symbolsFound.add(String(row.symbol).toUpperCase());
      }
    } catch {
      // Skip unparseable payloads
    }
  }

  const count = await upsertDividendRecords(allRecords);
  return { extracted: count, symbols: [...symbolsFound] };
}
