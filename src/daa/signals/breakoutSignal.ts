import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { fetchPriceSeriesWithCache, type CachedPricePoint } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";

export type DaaBreakoutAction = "open_or_add" | "hold" | "reduce_or_avoid" | "unavailable";

export type DaaBreakoutSignal = {
  symbol: string;
  action: DaaBreakoutAction;
  scorePct: number;
  confidencePct: number;
  triggered: boolean;
  metrics: {
    close: number;
    priorHighClose: number | null;
    volumeRatio: number | null;
    maFast: number | null;
    maSlow: number | null;
    maSlowRising: boolean;
    extensionPct: number | null;
  };
  reasons: string[];
};

type BreakoutParams = DaaSystemConfig["strategy"]["breakout"];

const MARKET_SESSION_META: Record<string, { timeZone: string; closeMinuteOfDay: number }> = {
  US: { timeZone: "America/New_York", closeMinuteOfDay: 16 * 60 },
  HK: { timeZone: "Asia/Hong_Kong", closeMinuteOfDay: 16 * 60 },
  CN: { timeZone: "Asia/Shanghai", closeMinuteOfDay: 15 * 60 },
  JP: { timeZone: "Asia/Tokyo", closeMinuteOfDay: 15 * 60 },
  KR: { timeZone: "Asia/Seoul", closeMinuteOfDay: 15 * 60 + 30 },
  TW: { timeZone: "Asia/Taipei", closeMinuteOfDay: 13 * 60 + 30 },
  SG: { timeZone: "Asia/Singapore", closeMinuteOfDay: 17 * 60 },
  UK: { timeZone: "Europe/London", closeMinuteOfDay: 16 * 60 + 30 },
  EU: { timeZone: "Europe/Berlin", closeMinuteOfDay: 17 * 60 + 30 },
};

function mean(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

function sma(values: number[], endExclusive: number, period: number): number | null {
  const n = Math.max(1, Math.trunc(period));
  if (endExclusive < n) return null;
  return mean(values.slice(endExclusive - n, endExclusive));
}

function max(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  return clean.length ? Math.max(...clean) : null;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function isCompleteDailyBar(bar: CachedPricePoint): boolean {
  return Number.isFinite(bar.open)
    && Number.isFinite(bar.high)
    && Number.isFinite(bar.low)
    && Number.isFinite(bar.close)
    && Number.isFinite(bar.volume)
    && (bar.open ?? 0) > 0
    && (bar.high ?? 0) > 0
    && (bar.low ?? 0) > 0
    && bar.close > 0
    && (bar.volume ?? 0) >= 0;
}

function resolveMarketSessionMeta(marketRaw: string | undefined): { timeZone: string; closeMinuteOfDay: number } {
  return MARKET_SESSION_META[String(marketRaw || "US").trim().toUpperCase()] || MARKET_SESSION_META.US;
}

function getZonedClock(now: Date, timeZone: string): { dateIso: string; minuteOfDay: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((item) => item.type === "year")?.value || "");
  const month = Number(parts.find((item) => item.type === "month")?.value || "");
  const day = Number(parts.find((item) => item.type === "day")?.value || "");
  const hour = Number(parts.find((item) => item.type === "hour")?.value || "");
  const minute = Number(parts.find((item) => item.type === "minute")?.value || "");
  return {
    dateIso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minuteOfDay: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function dropIncompleteLatestDailyBar(
  bars: CachedPricePoint[],
  market?: string,
  now = new Date(),
): CachedPricePoint[] {
  if (bars.length < 2) return bars;
  const session = resolveMarketSessionMeta(market);
  const marketClock = getZonedClock(now, session.timeZone);
  const latestDate = String(bars[bars.length - 1]?.date || "").slice(0, 10);
  if (!latestDate) return bars;
  if (latestDate < marketClock.dateIso) return bars;
  if (latestDate > marketClock.dateIso) return bars.slice(0, -1);
  if (marketClock.minuteOfDay >= session.closeMinuteOfDay + 20) return bars;
  return bars.slice(0, -1);
}

export function computeLatestVolumeBreakoutSignal(input: {
  symbol: string;
  market?: string;
  bars: CachedPricePoint[];
  params: BreakoutParams;
}): DaaBreakoutSignal {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const params = input.params;
  const bars = dropIncompleteLatestDailyBar((input.bars || [])
    .filter(isCompleteDailyBar)
    .sort((a, b) => String(a.date).localeCompare(String(b.date))), input.market);
  const lookback = Math.max(5, Math.trunc(params.breakoutLookback || 20));
  const maFastPeriod = Math.max(5, Math.trunc(params.maFast || 20));
  const maSlowPeriod = Math.max(maFastPeriod + 1, Math.trunc(params.maSlow || 50));
  const required = Math.max(lookback, maSlowPeriod) + 6;

  if (bars.length < required) {
    return {
      symbol,
      action: "unavailable",
      scorePct: 0,
      confidencePct: 0,
      triggered: false,
      metrics: {
        close: 0,
        priorHighClose: null,
        volumeRatio: null,
        maFast: null,
        maSlow: null,
        maSlowRising: false,
        extensionPct: null,
      },
      reasons: [`OHLCV 数据不足（${bars.length} < ${required}）`],
    };
  }

  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => Number(b.volume || 0));
  const i = bars.length - 1;
  const close = closes[i];
  const priorHighClose = max(closes.slice(i - lookback, i));
  const avgVolume = mean(volumes.slice(i - lookback, i));
  const volumeRatio = avgVolume && avgVolume > 0 ? volumes[i] / avgVolume : null;
  const maFast = sma(closes, i + 1, maFastPeriod);
  const maSlow = sma(closes, i + 1, maSlowPeriod);
  const maSlowPrev = sma(closes, i + 1 - 5, maSlowPeriod);
  const maSlowRising = maSlow != null && maSlowPrev != null && maSlow > maSlowPrev;
  const extensionPct = maSlow && maSlow > 0 ? (close - maSlow) / maSlow : null;

  const breaksHigh = priorHighClose != null && close > priorHighClose;
  const volumeConfirmed = volumeRatio != null && volumeRatio >= Math.max(1, Number(params.volMultiple) || 1.5);
  const trendConfirmed = maFast != null && maSlow != null && maFast > maSlow && maSlowRising;
  const extensionOk = extensionPct != null && extensionPct <= Math.max(0.01, Number(params.maxExtensionPct) || 0.2);
  const triggered = breaksHigh && volumeConfirmed && trendConfirmed && extensionOk;

  const reasons: string[] = [];
  let score = 35;
  if (breaksHigh) {
    score += 22;
    reasons.push("收盘突破回看高点");
  } else {
    reasons.push("尚未突破回看高点");
  }
  if (volumeConfirmed) {
    score += 18;
    reasons.push("成交量放大确认");
  } else {
    reasons.push("成交量未达到放量阈值");
  }
  if (trendConfirmed) {
    score += 18;
    reasons.push("均线趋势向上");
  } else {
    score -= 10;
    reasons.push("均线趋势未确认");
  }
  if (extensionOk) {
    score += 7;
    reasons.push("价格未显著追高");
  } else {
    score -= 12;
    reasons.push("价格相对慢线乖离偏高");
  }

  let action: DaaBreakoutAction = "hold";
  if (triggered) action = "open_or_add";
  else if ((maFast != null && close < maFast) || (maFast != null && maSlow != null && maFast < maSlow)) action = "reduce_or_avoid";

  return {
    symbol,
    action,
    scorePct: Number(clampPct(score).toFixed(2)),
    confidencePct: triggered ? 82 : action === "reduce_or_avoid" ? 70 : 58,
    triggered,
    metrics: {
      close: Number(close.toFixed(6)),
      priorHighClose: priorHighClose == null ? null : Number(priorHighClose.toFixed(6)),
      volumeRatio: volumeRatio == null ? null : Number(volumeRatio.toFixed(3)),
      maFast: maFast == null ? null : Number(maFast.toFixed(6)),
      maSlow: maSlow == null ? null : Number(maSlow.toFixed(6)),
      maSlowRising,
      extensionPct: extensionPct == null ? null : Number(extensionPct.toFixed(4)),
    },
    reasons,
  };
}

export async function buildVolumeBreakoutSignalForSymbol(input: {
  symbol: string;
  market?: string;
  currency?: string;
  params: BreakoutParams;
}): Promise<DaaBreakoutSignal> {
  const start = new Date(Date.now() - 420 * 86_400_000).toISOString().slice(0, 10);
  const yfinanceSymbol = toYfinanceSymbolByMarket(input.symbol, input.market || "US");
  try {
    const result = await fetchPriceSeriesWithCache(yfinanceSymbol, start, {
      market: input.market,
      currency: input.currency,
      requireOhlcv: true,
      minDbDays: 80,
      timeoutMs: 8000,
    });
    return computeLatestVolumeBreakoutSignal({
      symbol: input.symbol,
      market: input.market,
      bars: result.data,
      params: input.params,
    });
  } catch (err) {
    logSwallowed("breakoutSignal.build", err);
    return {
      symbol: String(input.symbol || "").trim().toUpperCase(),
      action: "unavailable",
      scorePct: 0,
      confidencePct: 0,
      triggered: false,
      metrics: {
        close: 0,
        priorHighClose: null,
        volumeRatio: null,
        maFast: null,
        maSlow: null,
        maSlowRising: false,
        extensionPct: null,
      },
      reasons: ["无法获取 OHLCV 数据"],
    };
  }
}
