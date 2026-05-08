import { clamp, meanOrNaN } from "@/src/core/math";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type DaaTechnicalSpecificMetric = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  status?: "bullish" | "bearish" | "neutral" | "unavailable";
  description?: string;
};

export type DaaTechnicalSignal = {
  symbol: string;
  scorePct: number;
  confidencePct: number;
  momentumRegime: "strong" | "neutral" | "weak";
  metrics: {
    close: number;
    sma20: number;
    sma60: number;
    ema12: number;
    ema26: number;
    macd: number;
    macdSignal: number;
    macdHist: number;
    rsi14: number;
    bollingerUpper: number;
    bollingerMid: number;
    bollingerLower: number;
    return20Pct: number;
    return60Pct: number;
    drawdown30Pct: number;
    annualizedVolPct: number;
    goldenCross: boolean;
    deathCross: boolean;
    macdBullishCross: boolean;
    macdBearishCross: boolean;
  };
  specific: DaaTechnicalSpecificMetric[];
  reasons: string[];
};


function std(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = meanOrNaN(values);
  const variance = values.reduce((acc, item) => acc + (item - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function sma(values: number[], period: number): number {
  if (!values.length) return Number.NaN;
  const n = Math.max(1, Math.trunc(period));
  const source = values.length >= n ? values.slice(-n) : values;
  return meanOrNaN(source);
}

function ema(values: number[], period: number): number {
  if (!values.length) return Number.NaN;
  const n = Math.max(1, Math.trunc(period));
  const k = 2 / (n + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i += 1) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const n = Math.max(1, Math.trunc(period));
  const k = 2 / (n + 1);
  let value = values[0];
  const out = [value];
  for (let i = 1; i < values.length; i += 1) {
    value = values[i] * k + value * (1 - k);
    out.push(value);
  }
  return out;
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

function computeDrawdownPct(values: number[], lookback = 30): number {
  if (!values.length) return 0;
  const source = values.slice(-Math.max(2, lookback));
  const peak = Math.max(...source);
  const latest = source[source.length - 1];
  if (!(peak > 0)) return 0;
  return ((latest - peak) / peak) * 100;
}

async function fetchDailyCloses(symbolRaw: string, days = 180): Promise<number[]> {
  const symbol = normalizeYfinanceSymbol(symbolRaw);
  if (!symbol) return [];

  const start = new Date(Date.now() - Math.max(80, Math.trunc(days)) * 86_400_000).toISOString().slice(0, 10);

  try {
    const result = await fetchPriceSeriesWithCache(symbol, start, { timeoutMs: 8000 });
    return result.data.map((p) => p.close).filter((c) => Number.isFinite(c) && c > 0);
  } catch (err) {
    logSwallowed("technicalSignal.fetchDailyCloses", err);
    return [];
  }
}

async function buildSpecificMetrics(symbol: string): Promise<DaaTechnicalSpecificMetric[]> {
  const normalized = String(symbol || "").trim().toUpperCase();

  if (/BTC/.test(normalized)) {
    const [btcCloses, ethCloses] = await Promise.all([
      fetchDailyCloses("BTC-USD", 120),
      fetchDailyCloses("ETH-USD", 120),
    ]);
    if (!btcCloses.length || !ethCloses.length) {
      return [{
        key: "btc_eth_ratio",
        label: "BTC/ETH 强弱比",
        value: "N/A",
        status: "unavailable",
        description: "缺少 BTC 或 ETH 行情数据",
      }];
    }

    const latestRatio = btcCloses[btcCloses.length - 1] / ethCloses[ethCloses.length - 1];
    const prevRatio = btcCloses[Math.max(0, btcCloses.length - 31)] / ethCloses[Math.max(0, ethCloses.length - 31)];
    const ratio30 = prevRatio > 0 ? ((latestRatio - prevRatio) / prevRatio) * 100 : 0;
    const vol7 = std(btcCloses.slice(-8).map((item, idx, arr) => idx > 0 ? (item - arr[idx - 1]) / arr[idx - 1] : 0).slice(1)) * Math.sqrt(365) * 100;

    return [
      {
        key: "btc_eth_ratio",
        label: "BTC/ETH 强弱比",
        value: Number(latestRatio.toFixed(4)),
        unit: "x",
        status: ratio30 >= 0 ? "bullish" : "bearish",
        description: `近30日变化 ${ratio30.toFixed(2)}%`,
      },
      {
        key: "btc_vol7",
        label: "BTC 7日年化波动",
        value: Number(vol7.toFixed(2)),
        unit: "%",
        status: vol7 > 80 ? "bearish" : "neutral",
        description: "高波动阶段建议控制杠杆与仓位",
      },
    ];
  }

  if (/XAU|GOLD|GC=F|XAG|SILVER|SI=F/.test(normalized)) {
    const [goldCloses, silverCloses] = await Promise.all([
      fetchDailyCloses("GC=F", 120),
      fetchDailyCloses("SI=F", 120),
    ]);

    if (!goldCloses.length || !silverCloses.length) {
      return [{
        key: "gold_silver_ratio",
        label: "金银比",
        value: "N/A",
        status: "unavailable",
        description: "缺少黄金或白银行情数据",
      }];
    }

    const latestRatio = goldCloses[goldCloses.length - 1] / silverCloses[silverCloses.length - 1];
    const ratios: number[] = [];
    const sample = Math.min(goldCloses.length, silverCloses.length);
    for (let i = Math.max(0, sample - 90); i < sample; i += 1) {
      const s = silverCloses[i];
      if (!(s > 0)) continue;
      ratios.push(goldCloses[i] / s);
    }
    const sorted = [...ratios].sort((a, b) => a - b);
    const percentile = sorted.length
      ? (sorted.findIndex((x) => x >= latestRatio) / Math.max(1, sorted.length - 1)) * 100
      : 50;

    return [{
      key: "gold_silver_ratio",
      label: "金银比",
      value: Number(latestRatio.toFixed(3)),
      unit: "x",
      status: percentile >= 70 ? "bearish" : percentile <= 30 ? "bullish" : "neutral",
      description: `90日分位 ${percentile.toFixed(1)}%`,
    }];
  }

  return [{
    key: "specific_unavailable",
    label: "资产特化指标",
    value: "N/A",
    status: "unavailable",
    description: "当前资产暂无首期特化指标",
  }];
}

export async function buildTechnicalSignalForSymbol(symbol: string): Promise<DaaTechnicalSignal | null> {
  const closes = await fetchDailyCloses(symbol, 260);
  if (closes.length < 70) return null;

  const close = closes[closes.length - 1] ?? Number.NaN;
  const prev20 = closes[Math.max(0, closes.length - 21)] ?? close;
  const prev60 = closes[Math.max(0, closes.length - 61)] ?? close;

  const sma20 = sma(closes, 20);
  const sma60 = sma(closes, 60);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  const ema12Series = emaSeries(closes, 12);
  const ema26Series = emaSeries(closes, 26);
  const macdSeries = ema12Series.map((item, idx) => item - (ema26Series[idx] ?? item));
  const macdSignalSeries = emaSeries(macdSeries, 9);
  const macd = macdSeries[macdSeries.length - 1] ?? 0;
  const macdSignal = macdSignalSeries[macdSignalSeries.length - 1] ?? 0;
  const macdHist = macd - macdSignal;

  const prevMacd = macdSeries[Math.max(0, macdSeries.length - 2)] ?? macd;
  const prevMacdSignal = macdSignalSeries[Math.max(0, macdSignalSeries.length - 2)] ?? macdSignal;

  const rsi14 = rsi(closes, 14);
  const return20Pct = prev20 > 0 ? ((close - prev20) / prev20) * 100 : 0;
  const return60Pct = prev60 > 0 ? ((close - prev60) / prev60) * 100 : 0;

  const bandSource = closes.slice(-20);
  const bollingerMid = meanOrNaN(bandSource);
  const bandStd = std(bandSource);
  const bollingerUpper = bollingerMid + bandStd * 2;
  const bollingerLower = bollingerMid - bandStd * 2;

  const dailyReturns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (!(prev > 0) || !(curr > 0)) continue;
    dailyReturns.push((curr - prev) / prev);
  }
  const annualizedVolPct = std(dailyReturns) * Math.sqrt(252) * 100;
  const drawdown30Pct = computeDrawdownPct(closes, 30);

  const prevSma20 = sma(closes.slice(0, -1), 20);
  const prevSma60 = sma(closes.slice(0, -1), 60);
  const goldenCross = prevSma20 <= prevSma60 && sma20 > sma60;
  const deathCross = prevSma20 >= prevSma60 && sma20 < sma60;
  const macdBullishCross = prevMacd <= prevMacdSignal && macd > macdSignal;
  const macdBearishCross = prevMacd >= prevMacdSignal && macd < macdSignal;

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
    reasons.push("短均线位于长均线上方");
  } else {
    score -= 8;
    reasons.push("中期趋势偏弱");
  }

  if (macd > macdSignal) {
    score += 6;
    reasons.push("MACD 位于信号线上方");
  } else {
    score -= 5;
    reasons.push("MACD 位于信号线下方");
  }

  if (goldenCross) {
    score += 7;
    reasons.push("出现均线金叉");
  }
  if (deathCross) {
    score -= 7;
    reasons.push("出现均线死叉");
  }

  if (return20Pct > 0) {
    score += clamp(return20Pct * 0.7, 0, 10);
    reasons.push("20日动量为正");
  } else {
    score += clamp(return20Pct * 0.5, -10, 0);
    reasons.push("20日动量为负");
  }

  if (rsi14 >= 45 && rsi14 <= 70) {
    score += 4;
    reasons.push("RSI 处于健康区间");
  } else if (rsi14 < 35) {
    score -= 5;
    reasons.push("RSI 偏弱");
  } else if (rsi14 > 78) {
    score -= 4;
    reasons.push("RSI 偏热");
  }

  if (annualizedVolPct > 45) {
    score -= 6;
    reasons.push("波动率偏高");
  }
  if (drawdown30Pct < -12) {
    score -= 5;
    reasons.push("近30日回撤偏深");
  }

  score = clamp(score, 0, 100);

  let momentumRegime: DaaTechnicalSignal["momentumRegime"] = "neutral";
  if (score >= 68) momentumRegime = "strong";
  if (score <= 42) momentumRegime = "weak";

  const confidencePct = clamp(
    35 + Math.min(45, closes.length / 5) + (momentumRegime === "neutral" ? 0 : 8),
    0,
    100,
  );

  const specific = await buildSpecificMetrics(symbol);

  return {
    symbol: String(symbol || "").trim().toUpperCase(),
    scorePct: Number(score.toFixed(2)),
    confidencePct: Number(confidencePct.toFixed(2)),
    momentumRegime,
    metrics: {
      close: Number(close.toFixed(6)),
      sma20: Number(sma20.toFixed(6)),
      sma60: Number(sma60.toFixed(6)),
      ema12: Number(ema12.toFixed(6)),
      ema26: Number(ema26.toFixed(6)),
      macd: Number(macd.toFixed(6)),
      macdSignal: Number(macdSignal.toFixed(6)),
      macdHist: Number(macdHist.toFixed(6)),
      rsi14: Number(rsi14.toFixed(2)),
      bollingerUpper: Number(bollingerUpper.toFixed(6)),
      bollingerMid: Number(bollingerMid.toFixed(6)),
      bollingerLower: Number(bollingerLower.toFixed(6)),
      return20Pct: Number(return20Pct.toFixed(2)),
      return60Pct: Number(return60Pct.toFixed(2)),
      drawdown30Pct: Number(drawdown30Pct.toFixed(2)),
      annualizedVolPct: Number(annualizedVolPct.toFixed(2)),
      goldenCross,
      deathCross,
      macdBullishCross,
      macdBearishCross,
    },
    specific,
    reasons,
  };
}
