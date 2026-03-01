import { addDaysIsoUtc, normalizeYfinanceSymbol } from "@/src/market/yfinance";

export type DaaTechnicalSignalV1 = {
  symbol: string;
  scorePct: number;
  confidencePct: number;
  momentumRegime: "strong" | "neutral" | "weak";
  metrics: {
    close: number;
    sma20: number;
    sma60: number;
    rsi14: number;
    return20Pct: number;
    annualizedVolPct: number;
  };
  reasons: string[];
};

function toFinite(v: unknown, fallback = Number.NaN): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function mean(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sum = values.reduce((acc, item) => acc + item, 0);
  return sum / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, item) => acc + (item - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function sma(values: number[], period: number): number {
  if (!values.length) return Number.NaN;
  const n = Math.max(1, Math.trunc(period));
  const source = values.length >= n ? values.slice(-n) : values;
  return mean(source);
}

function rsi(values: number[], period: number): number {
  const n = Math.max(2, Math.trunc(period));
  if (values.length < n + 1) return 50;

  const slice = values.slice(-(n + 1));
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gain += diff;
    else loss += Math.abs(diff);
  }

  const avgGain = gain / n;
  const avgLoss = loss / n;
  if (avgLoss <= 1e-9) return avgGain <= 1e-9 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return clamp(100 - 100 / (1 + rs), 0, 100);
}

async function fetchDailyClosesV1(symbolRaw: string, days = 180): Promise<number[]> {
  const symbol = normalizeYfinanceSymbol(symbolRaw);
  if (!symbol) return [];

  const end = new Date().toISOString().slice(0, 10);
  const start = addDaysIsoUtc(end, -Math.max(60, Math.trunc(days)));
  const endExclusive = addDaysIsoUtc(end, 1);

  const period1 = Math.floor(Date.parse(`${start}T00:00:00.000Z`) / 1000);
  const period2 = Math.floor(Date.parse(`${endExclusive}T00:00:00.000Z`) / 1000);

  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set("interval", "1d");
  upstream.searchParams.set("events", "div%7Csplit");
  upstream.searchParams.set("period1", String(period1));
  upstream.searchParams.set("period2", String(period2));

  try {
    const response = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
      },
    });
    if (!response.ok) return [];
    const payload = await response.json() as any;
    const closesRaw = Array.isArray(payload?.chart?.result?.[0]?.indicators?.quote?.[0]?.close)
      ? payload.chart.result[0].indicators.quote[0].close
      : [];

    return closesRaw
      .map((item: unknown) => toFinite(item))
      .filter((item: number) => Number.isFinite(item) && item > 0);
  } catch {
    return [];
  }
}

export async function buildTechnicalSignalForSymbolV1(symbol: string): Promise<DaaTechnicalSignalV1 | null> {
  const closes = await fetchDailyClosesV1(symbol, 240);
  if (closes.length < 40) return null;

  const close = closes[closes.length - 1] ?? Number.NaN;
  const prev20 = closes[Math.max(0, closes.length - 21)] ?? close;

  const sma20 = sma(closes, 20);
  const sma60 = sma(closes, 60);
  const rsi14 = rsi(closes, 14);
  const return20Pct = prev20 > 0 ? ((close - prev20) / prev20) * 100 : 0;

  const dailyReturns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (!(prev > 0) || !(curr > 0)) continue;
    dailyReturns.push((curr - prev) / prev);
  }
  const annualizedVolPct = std(dailyReturns) * Math.sqrt(252) * 100;

  const reasons: string[] = [];
  let score = 50;
  if (close > sma20) {
    score += 8;
    reasons.push("价格高于SMA20");
  } else {
    score -= 6;
    reasons.push("价格低于SMA20");
  }

  if (sma20 > sma60) {
    score += 10;
    reasons.push("短均线上穿长均线");
  } else {
    score -= 8;
    reasons.push("短均线弱于长均线");
  }

  if (return20Pct > 0) {
    score += clamp(return20Pct * 0.8, 0, 12);
    reasons.push("20日收益为正");
  } else {
    score += clamp(return20Pct * 0.6, -12, 0);
    reasons.push("20日收益为负");
  }

  if (rsi14 >= 45 && rsi14 <= 65) {
    score += 4;
    reasons.push("RSI处于健康区间");
  } else if (rsi14 < 35) {
    score -= 6;
    reasons.push("RSI偏弱");
  } else if (rsi14 > 75) {
    score -= 4;
    reasons.push("RSI偏热");
  }

  if (annualizedVolPct > 45) {
    score -= 5;
    reasons.push("波动率偏高");
  }

  score = clamp(score, 0, 100);

  let momentumRegime: DaaTechnicalSignalV1["momentumRegime"] = "neutral";
  if (score >= 68) momentumRegime = "strong";
  if (score <= 42) momentumRegime = "weak";

  const confidencePct = clamp(35 + Math.min(50, closes.length / 4) + (momentumRegime === "neutral" ? 0 : 8), 0, 100);

  return {
    symbol: String(symbol || "").trim().toUpperCase(),
    scorePct: Number(score.toFixed(2)),
    confidencePct: Number(confidencePct.toFixed(2)),
    momentumRegime,
    metrics: {
      close: Number(close.toFixed(6)),
      sma20: Number(sma20.toFixed(6)),
      sma60: Number(sma60.toFixed(6)),
      rsi14: Number(rsi14.toFixed(2)),
      return20Pct: Number(return20Pct.toFixed(2)),
      annualizedVolPct: Number(annualizedVolPct.toFixed(2)),
    },
    reasons,
  };
}

export async function buildTechnicalSignalsV1(symbols: string[]): Promise<DaaTechnicalSignalV1[]> {
  const uniq = [...new Set(symbols.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean))];
  if (!uniq.length) return [];

  const out: DaaTechnicalSignalV1[] = [];
  for (const symbol of uniq) {
    const signal = await buildTechnicalSignalForSymbolV1(symbol);
    if (signal) out.push(signal);
  }
  return out;
}
