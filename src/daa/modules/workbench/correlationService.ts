import { daaPgPool } from "@/src/daa/pg/daaPg";

export type CorrelationPair = {
  symbolA: string;
  symbolB: string;
  correlation: number;
  dataPoints: number;
};

export type CorrelationMatrixResult = {
  pairs: CorrelationPair[];
  maxCorrelation: number;
  maxCorrelationPair: { symbolA: string; symbolB: string } | null;
  avgCorrelation: number;
  highCorrelationCount: number;
  assetCount: number;
};

/**
 * Fetch recent daily close prices for the given symbols from daa_market_price_history_v1.
 * Returns a map of symbol -> sorted array of { date, price }.
 */
async function fetchPriceHistory(
  symbols: string[],
  lookbackDays: number,
): Promise<Map<string, { date: string; price: number }[]>> {
  if (symbols.length === 0) return new Map();

  const pool = daaPgPool();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Query price history, one row per symbol per day (use latest entry per day)
  const { rows } = await pool.query<{
    symbol: string;
    as_of_date: string;
    price: string;
  }>(
    `SELECT symbol,
            (as_of_ts AT TIME ZONE 'UTC')::date::text AS as_of_date,
            MAX(price) AS price
     FROM daa_market_price_history_v1
     WHERE symbol = ANY($1)
       AND as_of_ts >= $2::timestamptz
       AND price > 0
     GROUP BY symbol, (as_of_ts AT TIME ZONE 'UTC')::date
     ORDER BY symbol, as_of_date`,
    [symbols, cutoff],
  );

  const result = new Map<string, { date: string; price: number }[]>();
  for (const row of rows) {
    const sym = row.symbol.toUpperCase();
    if (!result.has(sym)) result.set(sym, []);
    result.get(sym)!.push({ date: row.as_of_date, price: Number(row.price) });
  }
  return result;
}

/**
 * Compute daily log returns from a sorted price series.
 */
function computeReturns(prices: { date: string; price: number }[]): Map<string, number> {
  const returns = new Map<string, number>();
  for (let i = 1; i < prices.length; i++) {
    if (prices[i].price > 0 && prices[i - 1].price > 0) {
      returns.set(prices[i].date, Math.log(prices[i].price / prices[i - 1].price));
    }
  }
  return returns;
}

/**
 * Compute Pearson correlation between two return series aligned by date.
 */
function pearsonCorrelation(
  returnsA: Map<string, number>,
  returnsB: Map<string, number>,
): { correlation: number; dataPoints: number } {
  const commonDates: string[] = [];
  for (const date of returnsA.keys()) {
    if (returnsB.has(date)) commonDates.push(date);
  }

  const n = commonDates.length;
  if (n < 20) return { correlation: 0, dataPoints: n }; // Not enough data

  const valsA = commonDates.map((d) => returnsA.get(d)!);
  const valsB = commonDates.map((d) => returnsB.get(d)!);

  const meanA = valsA.reduce((s, v) => s + v, 0) / n;
  const meanB = valsB.reduce((s, v) => s + v, 0) / n;

  let covAB = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const dA = valsA[i] - meanA;
    const dB = valsB[i] - meanB;
    covAB += dA * dB;
    varA += dA * dA;
    varB += dB * dB;
  }

  const denom = Math.sqrt(varA * varB);
  if (denom < 1e-12) return { correlation: 0, dataPoints: n };

  return { correlation: covAB / denom, dataPoints: n };
}

/**
 * Compute full pairwise correlation matrix for portfolio assets.
 *
 * @param symbols - array of portfolio symbol strings (e.g., ["SPY", "QQQ", "AAPL"])
 * @param lookbackDays - how many calendar days of history to use (default 252 ~ 1 year)
 * @param highThreshold - correlation above this is considered "high" (default 0.7)
 */
export async function computeCorrelationMatrix(input: {
  symbols: string[];
  lookbackDays?: number;
  highThreshold?: number;
}): Promise<CorrelationMatrixResult> {
  const symbols = [...new Set(input.symbols.map((s) => s.toUpperCase()))];
  const lookbackDays = input.lookbackDays ?? 252;
  const highThreshold = input.highThreshold ?? 0.7;

  if (symbols.length < 2) {
    return { pairs: [], maxCorrelation: 0, maxCorrelationPair: null, avgCorrelation: 0, highCorrelationCount: 0, assetCount: symbols.length };
  }

  const priceMap = await fetchPriceHistory(symbols, lookbackDays);
  const returnsMap = new Map<string, Map<string, number>>();
  for (const [sym, prices] of priceMap) {
    returnsMap.set(sym, computeReturns(prices));
  }

  const pairs: CorrelationPair[] = [];
  let maxCorr = -1;
  let maxPair: { symbolA: string; symbolB: string } | null = null;
  let totalCorr = 0;
  let highCount = 0;

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const retA = returnsMap.get(symbols[i]);
      const retB = returnsMap.get(symbols[j]);
      if (!retA || !retB) continue;

      const result = pearsonCorrelation(retA, retB);
      const absCorr = Math.abs(result.correlation);

      pairs.push({
        symbolA: symbols[i],
        symbolB: symbols[j],
        correlation: Number(result.correlation.toFixed(4)),
        dataPoints: result.dataPoints,
      });

      totalCorr += absCorr;
      if (absCorr > maxCorr) {
        maxCorr = absCorr;
        maxPair = { symbolA: symbols[i], symbolB: symbols[j] };
      }
      if (absCorr >= highThreshold) highCount++;
    }
  }

  const pairCount = pairs.length || 1;
  return {
    pairs,
    maxCorrelation: maxCorr >= 0 ? Number(maxCorr.toFixed(4)) : 0,
    maxCorrelationPair: maxPair,
    avgCorrelation: Number((totalCorr / pairCount).toFixed(4)),
    highCorrelationCount: highCount,
    assetCount: symbols.length,
  };
}
