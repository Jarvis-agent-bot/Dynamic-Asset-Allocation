import { clamp, meanOrNaN } from "@/src/core/math";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { toFinite } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { getYahooProvider } from "@/src/market/yahooProvider";

type DaaValuationMetricStatus = "bullish" | "bearish" | "neutral" | "unavailable";

type DaaValuationMetric = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  status?: DaaValuationMetricStatus;
  description?: string;
};

type DaaValuationRelativeValue = {
  key: string;
  label: string;
  value: number | null;
  percentile: number | null;
  trendPct: number | null;
  status: DaaValuationMetricStatus;
  description?: string;
};

export type DaaValuationSignal = {
  symbol: string;
  scorePct: number;
  confidencePct: number;
  temperature: "cheap" | "neutral" | "expensive";
  metrics: {
    close: number;
    percentile90: number;
    percentile252: number;
    zscore60: number;
    pe: number | null;
    pb: number | null;
    dividendYieldPct: number | null;
  };
  relative: DaaValuationRelativeValue | null;
  reasons: string[];
  specific: DaaValuationMetric[];
};

type FundamentalStats = {
  pe: number | null;
  pb: number | null;
  dividendYieldPct: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRawMetric(row: Record<string, unknown>, key: string): unknown {
  const value = row[key];
  return isRecord(value) ? value.raw : undefined;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = meanOrNaN(values);
  const variance = values.reduce((acc, item) => acc + ((item - avg) ** 2), 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function percentileOfLatest(values: number[], latest: number): number {
  if (!(latest > 0) || values.length <= 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const leCount = sorted.filter((item) => item <= latest).length;
  return clamp((leCount / sorted.length) * 100, 0, 100);
}

function zscoreOfLatest(values: number[], latest: number): number {
  if (!(latest > 0) || values.length < 5) return 0;
  const avg = meanOrNaN(values);
  const sigma = std(values);
  if (!(sigma > 1e-9)) return 0;
  return (latest - avg) / sigma;
}

async function fetchDailyCloses(symbolRaw: string, days = 320): Promise<number[]> {
  const symbol = normalizeYfinanceSymbol(symbolRaw);
  if (!symbol) return [];

  const start = new Date(Date.now() - Math.max(80, Math.trunc(days)) * 86_400_000).toISOString().slice(0, 10);

  try {
    const result = await fetchPriceSeriesWithCache(symbol, start, { timeoutMs: 8000 });
    return result.data.map((p) => p.close).filter((c) => Number.isFinite(c) && c > 0);
  } catch (err) {
    logSwallowed("valuationSignal.fetchDailyCloses", err);
    return [];
  }
}

async function fetchFundamentals(symbolRaw: string): Promise<FundamentalStats> {
  const symbol = normalizeYfinanceSymbol(symbolRaw);
  if (!symbol) return { pe: null, pb: null, dividendYieldPct: null };

  try {
    const yahooResult = await getYahooProvider().fetchQuoteSummary({
      symbol,
      modules: "summaryDetail,defaultKeyStatistics,financialData",
      timeoutMs: 8_000,
      context: {
        caller: "valuationSignal.fetchFundamentals",
        cacheStatus: "cache_bypass",
      },
    });
    const payload = yahooResult.payloadJson;
    const payloadRoot = isRecord(payload) ? payload : {};
    const quoteSummary = isRecord(payloadRoot.quoteSummary) ? payloadRoot.quoteSummary : {};
    const resultRows = Array.isArray(quoteSummary.result) ? quoteSummary.result : [];
    const result = isRecord(resultRows[0]) ? resultRows[0] : {};
    const summaryDetail = isRecord(result.summaryDetail) ? result.summaryDetail : {};
    const defaultStats = isRecord(result.defaultKeyStatistics) ? result.defaultKeyStatistics : {};
    const financialData = isRecord(result.financialData) ? result.financialData : {};

    const pe = toFinite(
      readRawMetric(summaryDetail, "trailingPE")
      ?? readRawMetric(defaultStats, "trailingPE")
      ?? readRawMetric(financialData, "forwardPE"),
      Number.NaN,
    );
    const pb = toFinite(readRawMetric(defaultStats, "priceToBook"), Number.NaN);
    const dividendYieldRaw = toFinite(readRawMetric(summaryDetail, "dividendYield"), Number.NaN);

    return {
      pe: Number.isFinite(pe) && pe > 0 ? pe : null,
      pb: Number.isFinite(pb) && pb > 0 ? pb : null,
      dividendYieldPct: Number.isFinite(dividendYieldRaw) && dividendYieldRaw >= 0 ? dividendYieldRaw * 100 : null,
    };
  } catch (err) {
    logSwallowed("valuationSignal.fetchFundamentals", err);
    return { pe: null, pb: null, dividendYieldPct: null };
  }
}

function inferAssetProfile(symbol: string): "crypto" | "commodity" | "default" {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) return "default";
  if (normalized.includes("-USD") || /^(BTC|ETH|SOL|BNB|XRP|DOGE|ADA|LTC)/.test(normalized)) return "crypto";
  if (/GC=F|SI=F|CL=F|BZ=F|XAU|XAG|GOLD|SILVER|GLD|IAU|SLV|USO|BNO|DBC|DBA/.test(normalized)) return "commodity";
  return "default";
}

async function buildRelativeValue(input: {
  symbol: string;
  getCloses: (symbol: string, days?: number) => Promise<number[]>;
}): Promise<{ metric: DaaValuationRelativeValue | null; scoreDelta: number; reason: string | null }> {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  if (!symbol) return { metric: null, scoreDelta: 0, reason: null };

  if (/BTC|ETH/.test(symbol)) {
    const [btc, eth] = await Promise.all([
      input.getCloses("BTC-USD", 180),
      input.getCloses("ETH-USD", 180),
    ]);
    const len = Math.min(btc.length, eth.length);
    if (len < 60) return { metric: null, scoreDelta: 0, reason: null };
    const ratios: number[] = [];
    for (let i = len - 120; i < len; i += 1) {
      if (i < 0) continue;
      const e = eth[i];
      if (!(e > 0)) continue;
      ratios.push(btc[i] / e);
    }
    if (ratios.length < 20) return { metric: null, scoreDelta: 0, reason: null };
    const latest = ratios[ratios.length - 1];
    const percentile = percentileOfLatest(ratios, latest);
    const prevIdx = Math.max(0, ratios.length - 31);
    const prev = ratios[prevIdx] || latest;
    const trendPct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
    const forBtc = /BTC/.test(symbol);
    const scoreDelta = forBtc
      ? (percentile >= 75 ? -6 : (percentile <= 25 ? 6 : 0))
      : (percentile >= 75 ? 6 : (percentile <= 25 ? -6 : 0));
    const reason = forBtc
      ? (scoreDelta > 0 ? "BTC 相对 ETH 偏便宜" : (scoreDelta < 0 ? "BTC 相对 ETH 偏贵" : null))
      : (scoreDelta > 0 ? "ETH 相对 BTC 偏便宜" : (scoreDelta < 0 ? "ETH 相对 BTC 偏贵" : null));
    return {
      metric: {
        key: "btc_eth_ratio",
        label: "BTC/ETH 强弱比",
        value: Number(latest.toFixed(4)),
        percentile: Number(percentile.toFixed(2)),
        trendPct: Number(trendPct.toFixed(2)),
        status: scoreDelta > 0 ? "bullish" : (scoreDelta < 0 ? "bearish" : "neutral"),
        description: `120日分位 ${percentile.toFixed(1)}%，30日变化 ${trendPct.toFixed(2)}%`,
      },
      scoreDelta,
      reason,
    };
  }

  if (/GLD|IAU|SLV|GC=F|SI=F|XAU|XAG/.test(symbol)) {
    const [gold, silver] = await Promise.all([
      input.getCloses("GC=F", 180),
      input.getCloses("SI=F", 180),
    ]);
    const len = Math.min(gold.length, silver.length);
    if (len < 60) return { metric: null, scoreDelta: 0, reason: null };
    const ratios: number[] = [];
    for (let i = len - 120; i < len; i += 1) {
      if (i < 0) continue;
      if (!(silver[i] > 0)) continue;
      ratios.push(gold[i] / silver[i]);
    }
    if (ratios.length < 20) return { metric: null, scoreDelta: 0, reason: null };
    const latest = ratios[ratios.length - 1];
    const percentile = percentileOfLatest(ratios, latest);
    const scoreDelta = percentile <= 25 ? 5 : (percentile >= 75 ? -5 : 0);
    const reason = scoreDelta > 0 ? "金银比低位，黄金链路相对便宜" : (scoreDelta < 0 ? "金银比高位，黄金链路相对偏贵" : null);
    return {
      metric: {
        key: "gold_silver_ratio",
        label: "金银比",
        value: Number(latest.toFixed(3)),
        percentile: Number(percentile.toFixed(2)),
        trendPct: null,
        status: scoreDelta > 0 ? "bullish" : (scoreDelta < 0 ? "bearish" : "neutral"),
        description: `120日分位 ${percentile.toFixed(1)}%`,
      },
      scoreDelta,
      reason,
    };
  }

  if (/USO|BNO|CL=F|BZ=F/.test(symbol)) {
    const [uso, bno] = await Promise.all([
      input.getCloses("USO", 180),
      input.getCloses("BNO", 180),
    ]);
    const len = Math.min(uso.length, bno.length);
    if (len < 60) return { metric: null, scoreDelta: 0, reason: null };
    const ratios: number[] = [];
    for (let i = len - 120; i < len; i += 1) {
      if (i < 0) continue;
      if (!(bno[i] > 0)) continue;
      ratios.push(uso[i] / bno[i]);
    }
    if (ratios.length < 20) return { metric: null, scoreDelta: 0, reason: null };
    const latest = ratios[ratios.length - 1];
    const percentile = percentileOfLatest(ratios, latest);
    const scoreDelta = percentile <= 25 ? 4 : (percentile >= 75 ? -4 : 0);
    const reason = scoreDelta > 0 ? "油品相对比价位于低位" : (scoreDelta < 0 ? "油品相对比价位于高位" : null);
    return {
      metric: {
        key: "uso_bno_ratio",
        label: "USO/BNO 相对比价",
        value: Number(latest.toFixed(4)),
        percentile: Number(percentile.toFixed(2)),
        trendPct: null,
        status: scoreDelta > 0 ? "bullish" : (scoreDelta < 0 ? "bearish" : "neutral"),
        description: `120日分位 ${percentile.toFixed(1)}%`,
      },
      scoreDelta,
      reason,
    };
  }

  return { metric: null, scoreDelta: 0, reason: null };
}

function scoreTemperature(score: number): "cheap" | "neutral" | "expensive" {
  if (score >= 62) return "cheap";
  if (score <= 38) return "expensive";
  return "neutral";
}

export async function buildValuationSignalForSymbol(
  symbolRaw: string,
  options?: {
    getCloses?: (symbol: string, days?: number) => Promise<number[]>;
  },
): Promise<DaaValuationSignal | null> {
  const symbol = String(symbolRaw || "").trim().toUpperCase();
  if (!symbol) return null;

  const getCloses = options?.getCloses || fetchDailyCloses;
  const closes = await getCloses(symbol, 320);
  const latest = closes[closes.length - 1] ?? Number.NaN;
  if (!(latest > 0) || closes.length < 40) {
    return {
      symbol,
      scorePct: 50,
      confidencePct: 25,
      temperature: "neutral",
      metrics: {
        close: Number.isFinite(latest) ? latest : 0,
        percentile90: 50,
        percentile252: 50,
        zscore60: 0,
        pe: null,
        pb: null,
        dividendYieldPct: null,
      },
      relative: null,
      reasons: ["历史价格不足，估值信号按中性处理"],
      specific: [{
        key: "valuation_data_gap",
        label: "估值数据",
        value: "N/A",
        status: "unavailable",
        description: "数据不足，建议补充更长行情历史",
      }],
    };
  }

  const p90 = percentileOfLatest(closes.slice(-90), latest);
  const p252 = percentileOfLatest(closes.slice(-252), latest);
  const z60 = zscoreOfLatest(closes.slice(-60), latest);

  let fundamentals: FundamentalStats = { pe: null, pb: null, dividendYieldPct: null };
  const profile = inferAssetProfile(symbol);
  if (profile !== "crypto") {
    fundamentals = await fetchFundamentals(symbol);
  }

  const relative = await buildRelativeValue({
    symbol,
    getCloses,
  });

  let score = 50;
  const reasons: string[] = [];

  if (p90 <= 25) {
    score += 8;
    reasons.push("价格位于90日低分位");
  } else if (p90 >= 75) {
    score -= 8;
    reasons.push("价格位于90日高分位");
  }

  if (p252 <= 30) {
    score += 10;
    reasons.push("价格位于年内低分位");
  } else if (p252 >= 70) {
    score -= 10;
    reasons.push("价格位于年内高分位");
  }

  if (z60 <= -1) {
    score += 8;
    reasons.push("价格偏离均值较低");
  } else if (z60 >= 1) {
    score -= 8;
    reasons.push("价格偏离均值较高");
  }

  if (fundamentals.pe != null) {
    if (fundamentals.pe <= 15) {
      score += 6;
      reasons.push(`PE ${fundamentals.pe.toFixed(2)} 偏低`);
    } else if (fundamentals.pe >= 35) {
      score -= 6;
      reasons.push(`PE ${fundamentals.pe.toFixed(2)} 偏高`);
    }
  }

  if (fundamentals.pb != null) {
    if (fundamentals.pb <= 2) {
      score += 5;
      reasons.push(`PB ${fundamentals.pb.toFixed(2)} 偏低`);
    } else if (fundamentals.pb >= 6) {
      score -= 5;
      reasons.push(`PB ${fundamentals.pb.toFixed(2)} 偏高`);
    }
  }

  if (fundamentals.dividendYieldPct != null && fundamentals.dividendYieldPct >= 3) {
    score += 2;
    reasons.push(`股息率 ${fundamentals.dividendYieldPct.toFixed(2)}% 具备支撑`);
  }

  score += relative.scoreDelta;
  if (relative.reason) reasons.push(relative.reason);

  const scorePct = clamp(score, 0, 100);
  const availableMetricCount = [
    Number.isFinite(p90),
    Number.isFinite(p252),
    Number.isFinite(z60),
    fundamentals.pe != null,
    fundamentals.pb != null,
    fundamentals.dividendYieldPct != null,
    relative.metric != null,
  ].filter(Boolean).length;
  const confidencePct = clamp(30 + availableMetricCount * 9, 25, 92);

  const specific: DaaValuationMetric[] = [
    {
      key: "percentile90",
      label: "90日价格分位",
      value: Number(p90.toFixed(2)),
      unit: "%",
      status: p90 <= 25 ? "bullish" : (p90 >= 75 ? "bearish" : "neutral"),
    },
    {
      key: "percentile252",
      label: "252日价格分位",
      value: Number(p252.toFixed(2)),
      unit: "%",
      status: p252 <= 30 ? "bullish" : (p252 >= 70 ? "bearish" : "neutral"),
    },
    {
      key: "zscore60",
      label: "60日Z-Score",
      value: Number(z60.toFixed(3)),
      status: z60 <= -1 ? "bullish" : (z60 >= 1 ? "bearish" : "neutral"),
    },
    {
      key: "pe",
      label: "PE(TTM)",
      value: fundamentals.pe == null ? "N/A" : Number(fundamentals.pe.toFixed(2)),
      status: fundamentals.pe == null ? "unavailable" : (fundamentals.pe <= 15 ? "bullish" : (fundamentals.pe >= 35 ? "bearish" : "neutral")),
    },
    {
      key: "pb",
      label: "PB",
      value: fundamentals.pb == null ? "N/A" : Number(fundamentals.pb.toFixed(2)),
      status: fundamentals.pb == null ? "unavailable" : (fundamentals.pb <= 2 ? "bullish" : (fundamentals.pb >= 6 ? "bearish" : "neutral")),
    },
    {
      key: "dividend_yield",
      label: "股息率",
      value: fundamentals.dividendYieldPct == null ? "N/A" : Number(fundamentals.dividendYieldPct.toFixed(2)),
      unit: fundamentals.dividendYieldPct == null ? undefined : "%",
      status: fundamentals.dividendYieldPct == null ? "unavailable" : (fundamentals.dividendYieldPct >= 3 ? "bullish" : "neutral"),
    },
  ];
  if (relative.metric) {
    specific.push({
      key: relative.metric.key,
      label: relative.metric.label,
      value: Number(relative.metric.value?.toFixed(4) || 0),
      unit: "x",
      status: relative.metric.status,
      description: relative.metric.description,
    });
  }

  return {
    symbol,
    scorePct: Number(scorePct.toFixed(2)),
    confidencePct: Number(confidencePct.toFixed(2)),
    temperature: scoreTemperature(scorePct),
    metrics: {
      close: Number(latest.toFixed(6)),
      percentile90: Number(p90.toFixed(2)),
      percentile252: Number(p252.toFixed(2)),
      zscore60: Number(z60.toFixed(4)),
      pe: fundamentals.pe == null ? null : Number(fundamentals.pe.toFixed(4)),
      pb: fundamentals.pb == null ? null : Number(fundamentals.pb.toFixed(4)),
      dividendYieldPct: fundamentals.dividendYieldPct == null ? null : Number(fundamentals.dividendYieldPct.toFixed(4)),
    },
    relative: relative.metric,
    reasons: reasons.length > 0 ? reasons.slice(0, 6) : ["估值信号中性"],
    specific,
  };
}
