"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type IPriceLine,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";

type PriceBar = {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

type PriceSeriesInterval = "1d" | "1h";
type RangeKey = "1D" | "5D" | "1M" | "3M" | "1Y";
type IndicatorKey = "ma" | "ema" | "boll" | "volume" | "macd" | "kdj";

type CrosshairSnapshot = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
};

type MacdBundle = {
  dif: LineData[];
  dea: LineData[];
  histogram: HistogramData[];
};

type KdjBundle = {
  k: LineData[];
  d: LineData[];
  j: LineData[];
};

type BollBundle = {
  upper: LineData[];
  mid: LineData[];
  lower: LineData[];
};

type IndicatorSnapshot = {
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  ema12?: number;
  ema26?: number;
  bollUpper?: number;
  bollMid?: number;
  bollLower?: number;
  macdDif?: number;
  macdDea?: number;
  macdHist?: number;
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
};

type KlineDataSource = {
  source: string;
  upstream: string;
  rawCount: number;
  rows: number;
  interval: PriceSeriesInterval;
  updatedAt: string;
  completeOhlcv: boolean;
};

export type KlineTradeMarker = {
  date: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
};

const TIME_RANGES: { key: RangeKey; label: string; days: number; interval: PriceSeriesInterval }[] = [
  { key: "1D", label: "1日", days: 2, interval: "1h" },
  { key: "5D", label: "5日", days: 10, interval: "1h" },
  { key: "1M", label: "1月", days: 30, interval: "1d" },
  { key: "3M", label: "3月", days: 90, interval: "1d" },
  { key: "1Y", label: "1年", days: 365, interval: "1d" },
];

const MA_LINES = [
  { key: "ma5", period: 5, label: "MA5", color: "#f7b500" },
  { key: "ma10", period: 10, label: "MA10", color: "#d957ff" },
  { key: "ma20", period: 20, label: "MA20", color: "#2bb6ff" },
  { key: "ma60", period: 60, label: "MA60", color: "#8b7cf6" },
] as const;

const INDICATOR_LABELS: { key: IndicatorKey; label: string }[] = [
  { key: "ma", label: "MA" },
  { key: "ema", label: "EMA" },
  { key: "boll", label: "BOLL" },
  { key: "volume", label: "VOL" },
  { key: "macd", label: "MACD" },
  { key: "kdj", label: "KDJ" },
];

const COLORS = {
  bg: "#050607",
  panel: "#090d10",
  panelSoft: "#0d1216",
  grid: "rgba(107, 114, 128, 0.12)",
  gridStrong: "rgba(148, 163, 184, 0.18)",
  text: "#d6dde5",
  muted: "#8a939f",
  faint: "#59636f",
  up: "#00c076",
  down: "#f84960",
  amber: "#f7b500",
  cyan: "#2bb6ff",
  purple: "#8b7cf6",
  volumeUp: "rgba(0, 192, 118, 0.42)",
  volumeDown: "rgba(248, 73, 96, 0.42)",
} as const;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function barOpen(bar: PriceBar): number {
  return finiteNumber(bar.open) && bar.open > 0 ? bar.open : bar.close;
}

function barHigh(bar: PriceBar): number {
  const open = barOpen(bar);
  return finiteNumber(bar.high) && bar.high > 0 ? bar.high : Math.max(open, bar.close);
}

function barLow(bar: PriceBar): number {
  const open = barOpen(bar);
  return finiteNumber(bar.low) && bar.low > 0 ? bar.low : Math.min(open, bar.close);
}

function round(value: number, digits = 4): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function hasCompleteOhlc(bar: PriceBar): boolean {
  return (
    finiteNumber(bar.open) &&
    finiteNumber(bar.high) &&
    finiteNumber(bar.low) &&
    finiteNumber(bar.close) &&
    bar.open > 0 &&
    bar.high > 0 &&
    bar.low > 0 &&
    bar.close > 0
  );
}

function hasCompleteOhlcv(bar: PriceBar): boolean {
  return hasCompleteOhlc(bar) && finiteNumber(bar.volume) && bar.volume >= 0;
}

function toCandlestickData(bars: PriceBar[]): CandlestickData[] {
  return bars
    .filter(hasCompleteOhlc)
    .map((bar) => ({
      time: bar.date as Time,
      open: bar.open!,
      high: bar.high!,
      low: bar.low!,
      close: bar.close,
    }));
}

function toVolumeData(bars: PriceBar[]): HistogramData[] {
  return bars
    .filter((bar) => finiteNumber(bar.volume) && bar.volume >= 0)
    .map((bar) => ({
      time: bar.date as Time,
      value: bar.volume ?? 0,
      color: bar.close >= barOpen(bar) ? COLORS.volumeUp : COLORS.volumeDown,
    }));
}

function computeMA(bars: PriceBar[], period: number): LineData[] {
  const result: LineData[] = [];
  for (let i = period - 1; i < bars.length; i += 1) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) sum += bars[j].close;
    result.push({ time: bars[i].date as Time, value: round(sum / period) });
  }
  return result;
}

function computeEmaValues(bars: PriceBar[], period: number): Array<number | null> {
  const values: Array<number | null> = new Array(bars.length).fill(null);
  if (bars.length < period) return values;

  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += bars[i].close;

  let ema = seed / period;
  values[period - 1] = ema;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < bars.length; i += 1) {
    ema = (bars[i].close - ema) * multiplier + ema;
    values[i] = ema;
  }
  return values;
}

function computeEMA(bars: PriceBar[], period: number): LineData[] {
  return computeEmaValues(bars, period).flatMap((value, index) => (
    value == null ? [] : [{ time: bars[index].date as Time, value: round(value) }]
  ));
}

function computeBoll(bars: PriceBar[], period = 20, deviation = 2): BollBundle {
  const upper: LineData[] = [];
  const mid: LineData[] = [];
  const lower: LineData[] = [];

  for (let i = period - 1; i < bars.length; i += 1) {
    const closes = bars.slice(i - period + 1, i + 1).map((bar) => bar.close);
    const mean = closes.reduce((sum, value) => sum + value, 0) / period;
    const variance = closes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    const time = bars[i].date as Time;
    upper.push({ time, value: round(mean + deviation * std) });
    mid.push({ time, value: round(mean) });
    lower.push({ time, value: round(mean - deviation * std) });
  }

  return { upper, mid, lower };
}

function computeMACD(bars: PriceBar[], fast = 12, slow = 26, signal = 9): MacdBundle {
  const emaFast = computeEmaValues(bars, fast);
  const emaSlow = computeEmaValues(bars, slow);
  const difValues: Array<number | null> = new Array(bars.length).fill(null);
  const deaValues: Array<number | null> = new Array(bars.length).fill(null);
  const validDiffs: number[] = [];
  let dea: number | null = null;
  const multiplier = 2 / (signal + 1);

  for (let i = 0; i < bars.length; i += 1) {
    const fastValue = emaFast[i];
    const slowValue = emaSlow[i];
    if (fastValue == null || slowValue == null) continue;

    const dif = fastValue - slowValue;
    difValues[i] = dif;
    validDiffs.push(dif);

    if (validDiffs.length === signal) {
      dea = validDiffs.reduce((sum, value) => sum + value, 0) / signal;
    } else if (validDiffs.length > signal && dea != null) {
      dea = (dif - dea) * multiplier + dea;
    }
    deaValues[i] = dea;
  }

  const dif: LineData[] = [];
  const deaLine: LineData[] = [];
  const histogram: HistogramData[] = [];

  for (let i = 0; i < bars.length; i += 1) {
    const time = bars[i].date as Time;
    const difValue = difValues[i];
    const deaValue = deaValues[i];
    if (difValue != null) dif.push({ time, value: round(difValue) });
    if (deaValue != null) {
      deaLine.push({ time, value: round(deaValue) });
    }
    if (difValue != null && deaValue != null) {
      const value = (difValue - deaValue) * 2;
      histogram.push({
        time,
        value: round(value),
        color: value >= 0 ? "rgba(0, 192, 118, 0.7)" : "rgba(248, 73, 96, 0.7)",
      });
    }
  }

  return { dif, dea: deaLine, histogram };
}

function computeKDJ(bars: PriceBar[], period = 9): KdjBundle {
  const k: LineData[] = [];
  const d: LineData[] = [];
  const j: LineData[] = [];
  let previousK = 50;
  let previousD = 50;

  for (let i = period - 1; i < bars.length; i += 1) {
    const window = bars.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map(barHigh));
    const low = Math.min(...window.map(barLow));
    const rsv = high === low ? 50 : ((bars[i].close - low) / (high - low)) * 100;
    const kValue = (2 / 3) * previousK + (1 / 3) * rsv;
    const dValue = (2 / 3) * previousD + (1 / 3) * kValue;
    const jValue = 3 * kValue - 2 * dValue;
    const time = bars[i].date as Time;

    k.push({ time, value: round(kValue, 2) });
    d.push({ time, value: round(dValue, 2) });
    j.push({ time, value: round(jValue, 2) });

    previousK = kValue;
    previousD = dValue;
  }

  return { k, d, j };
}

function decimalsForPrice(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 1000) return 0;
  if (abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  return 6;
}

function formatPrice(value: number | null | undefined, digits?: number): string {
  if (!finiteNumber(value)) return "--";
  const precision = digits ?? decimalsForPrice(value);
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function formatSigned(value: number | null | undefined, digits?: number): string {
  if (!finiteNumber(value)) return "--";
  return `${value >= 0 ? "+" : ""}${formatPrice(value, digits)}`;
}

function formatVolume(value: number | null | undefined): string {
  if (!finiteNumber(value)) return "--";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return value.toFixed(0);
}

function formatChartTime(value: string | null | undefined, interval: PriceSeriesInterval): string {
  if (!value) return "--";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  const date = new Date(ms);
  if (interval === "1h") {
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getRangeConfig(range: RangeKey) {
  return TIME_RANGES.find((item) => item.key === range) ?? TIME_RANGES[2];
}

function bucketLiveTime(ts: string, interval: PriceSeriesInterval): string {
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return ts;
  const date = new Date(ms);
  if (interval === "1d") return date.toISOString().slice(0, 10);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function compareBarTime(left: string, right: string): number {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) return leftMs - rightMs;
  return left.localeCompare(right);
}

function mergeLivePriceIntoBars(
  bars: PriceBar[],
  livePrice: { price: number; ts: string } | null | undefined,
  interval: PriceSeriesInterval,
): PriceBar[] {
  if (!livePrice || !finiteNumber(livePrice.price) || livePrice.price <= 0 || !livePrice.ts) return bars;
  const bucket = bucketLiveTime(livePrice.ts, interval);
  const next = [...bars];
  const last = next[next.length - 1];

  if (!last) {
    next.push({
      date: bucket,
      open: livePrice.price,
      high: livePrice.price,
      low: livePrice.price,
      close: livePrice.price,
      volume: 0,
    });
    return next;
  }

  const cmp = compareBarTime(bucket, last.date);
  if (cmp < 0) return bars;

  if (cmp === 0) {
    next[next.length - 1] = {
      ...last,
      high: Math.max(barHigh(last), livePrice.price),
      low: Math.min(barLow(last), livePrice.price),
      close: livePrice.price,
      volume: last.volume ?? 0,
    };
    return next;
  }

  const open = last.close;
  next.push({
    date: bucket,
    open,
    high: Math.max(open, livePrice.price),
    low: Math.min(open, livePrice.price),
    close: livePrice.price,
    volume: 0,
  });
  return next;
}

function dataAgeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Date.now() - ms);
}

function resolveMarkerTime(markerDate: string, bars: PriceBar[]): string | null {
  if (bars.some((bar) => bar.date === markerDate)) return markerDate;
  return bars.find((bar) => bar.date.startsWith(markerDate))?.date ?? null;
}

function seriesValueAt(series: LineData[], date: string): number | undefined {
  return series.find((point) => String(point.time) === date)?.value;
}

function histogramValueAt(series: HistogramData[], date: string): number | undefined {
  return series.find((point) => String(point.time) === date)?.value;
}

function applyPaneHeights(chart: IChartApi, visibility: Record<IndicatorKey, boolean>) {
  const panes = chart.panes();
  panes[0]?.setHeight(280);
  panes[1]?.setHeight(visibility.volume ? 72 : 18);
  panes[2]?.setHeight(visibility.macd ? 72 : 18);
  panes[3]?.setHeight(visibility.kdj ? 68 : 18);
}

function applyLowerPaneScale(chart: IChartApi, paneIndex: number) {
  chart.priceScale("right", paneIndex).applyOptions({
    borderVisible: false,
    textColor: COLORS.faint,
    scaleMargins: { top: 0.12, bottom: 0.12 },
  });
}

function indicatorTextColor(value: number | null | undefined): string {
  if (!finiteNumber(value) || value === 0) return "text-[#8a939f]";
  return value > 0 ? "text-[#00c076]" : "text-[#f84960]";
}

function isPriceNearVisibleRange(price: number, candles: CandlestickData[]): boolean {
  if (!finiteNumber(price) || price <= 0 || candles.length <= 0) return false;
  const lows = candles.map((bar) => bar.low);
  const highs = candles.map((bar) => bar.high);
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  const range = Math.max(high - low, high * 0.02);
  return price >= low - range * 0.35 && price <= high + range * 0.35;
}

function setPaddedVisibleRange(chart: IChartApi, candles: CandlestickData[]) {
  if (candles.length <= 0) return;
  const leftPadding = Math.min(8, Math.max(2, Math.round(candles.length * 0.03)));
  const rightPadding = Math.min(10, Math.max(4, Math.round(candles.length * 0.05)));
  const minVisibleBars = 80;
  const visibleBars = candles.length + leftPadding + rightPadding;
  const extraPadding = Math.max(0, minVisibleBars - visibleBars);
  chart.timeScale().setVisibleLogicalRange({
    from: -leftPadding - extraPadding,
    to: candles.length - 1 + rightPadding,
  });
}

export function AssetKlineChart({
  symbol,
  market,
  className,
  tradeMarkers,
  costBasisPerShare,
  livePrice,
}: {
  symbol: string;
  market: string;
  className?: string;
  tradeMarkers?: KlineTradeMarker[];
  costBasisPerShare?: number | null;
  livePrice?: { price: number; ts: string; currency?: string; source?: string } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const macdHistogramRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const macdDifRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdDeaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const kdjKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const kdjDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const kdjJRef = useRef<ISeriesApi<"Line"> | null>(null);
  const maSeriesRefs = useRef<Array<ISeriesApi<"Line">>>([]);
  const emaSeriesRefs = useRef<Array<ISeriesApi<"Line">>>([]);
  const bollSeriesRefs = useRef<Array<ISeriesApi<"Line">>>([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const costLineRef = useRef<IPriceLine | null>(null);

  const [range, setRange] = useState<RangeKey>("1M");
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dataSource, setDataSource] = useState<KlineDataSource | null>(null);
  const [crosshairData, setCrosshairData] = useState<CrosshairSnapshot | null>(null);
  const [indicatorVisibility, setIndicatorVisibility] = useState<Record<IndicatorKey, boolean>>({
    ma: true,
    ema: false,
    boll: false,
    volume: true,
    macd: true,
    kdj: true,
  });

  const rangeConfig = useMemo(() => getRangeConfig(range), [range]);
  const currentInterval = rangeConfig.interval;

  const startDate = useMemo(() => {
    const days = rangeConfig.days;
    if (days <= 0) return undefined;
    const date = new Date(Date.now() - days * 86_400_000);
    return date.toISOString().slice(0, 10);
  }, [rangeConfig.days]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ symbol, adjusted: "0", requireOhlcv: "1", interval: currentInterval });
      if (market) qs.set("market", market);
      if (startDate) qs.set("start", startDate);

      const res = await fetch(`/api/daa/market/yfinance/price-series?${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("登录已过期，请刷新页面重新登录");
        if (res.status === 502) throw new Error("行情数据源暂时不可用，请稍后重试");
        throw new Error(`请求失败 (${res.status})`);
      }

      const json = await res.json();
      const data = json?.data ?? json;
      const series: PriceBar[] = Array.isArray(data.series) ? data.series : [];
      const completeSeries = series.filter(hasCompleteOhlc);
      if (series.length === 0) setError("暂无行情数据");
      else if (completeSeries.length === 0) setError("行情缺少真实 OHLCV，不能绘制蜡烛线");
      setBars(completeSeries);
      const latest = completeSeries[completeSeries.length - 1] ?? null;
      setDataSource({
        source: typeof data.source === "string" ? data.source : "--",
        upstream: typeof data.upstream === "string" ? data.upstream : "--",
        rawCount: Number.isFinite(Number(data.rawCount)) ? Number(data.rawCount) : completeSeries.length,
        rows: completeSeries.length,
        interval: currentInterval,
        updatedAt: latest?.date ?? "",
        completeOhlcv: series.length > 0 && completeSeries.length === series.length && completeSeries.every(hasCompleteOhlcv),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载行情失败");
      setDataSource(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, market, startDate, currentInterval]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const chartBars = useMemo(
    () => mergeLivePriceIntoBars(bars, livePrice, currentInterval),
    [bars, livePrice, currentInterval],
  );

  const indicatorData = useMemo(() => {
    const ma = MA_LINES.map((line) => ({
      key: line.key,
      period: line.period,
      label: line.label,
      color: line.color,
      data: computeMA(chartBars, line.period),
    }));
    const ema12 = computeEMA(chartBars, 12);
    const ema26 = computeEMA(chartBars, 26);
    const boll = computeBoll(chartBars);
    const macd = computeMACD(chartBars);
    const kdj = computeKDJ(chartBars);
    return { ma, ema12, ema26, boll, macd, kdj };
  }, [chartBars]);

  const latestPrice = useMemo(() => {
    if (chartBars.length <= 0) return null;
    const last = chartBars[chartBars.length - 1];
    const previous = chartBars.length >= 2 ? chartBars[chartBars.length - 2] : null;
    const change = previous ? last.close - previous.close : 0;
    const changePct = previous && previous.close > 0 ? (change / previous.close) * 100 : 0;
    return {
      date: last.date,
      open: barOpen(last),
      high: barHigh(last),
      low: barLow(last),
      close: last.close,
      volume: last.volume ?? 0,
      change,
      changePct,
    };
  }, [chartBars]);

  const displayData = crosshairData ?? latestPrice;
  const displayIndicators = useMemo<IndicatorSnapshot>(() => {
    if (!displayData) return {};
    const date = displayData.date;
    return {
      ma5: seriesValueAt(indicatorData.ma[0]?.data ?? [], date),
      ma10: seriesValueAt(indicatorData.ma[1]?.data ?? [], date),
      ma20: seriesValueAt(indicatorData.ma[2]?.data ?? [], date),
      ma60: seriesValueAt(indicatorData.ma[3]?.data ?? [], date),
      ema12: seriesValueAt(indicatorData.ema12, date),
      ema26: seriesValueAt(indicatorData.ema26, date),
      bollUpper: seriesValueAt(indicatorData.boll.upper, date),
      bollMid: seriesValueAt(indicatorData.boll.mid, date),
      bollLower: seriesValueAt(indicatorData.boll.lower, date),
      macdDif: seriesValueAt(indicatorData.macd.dif, date),
      macdDea: seriesValueAt(indicatorData.macd.dea, date),
      macdHist: histogramValueAt(indicatorData.macd.histogram, date),
      kdjK: seriesValueAt(indicatorData.kdj.k, date),
      kdjD: seriesValueAt(indicatorData.kdj.d, date),
      kdjJ: seriesValueAt(indicatorData.kdj.j, date),
    };
  }, [displayData, indicatorData]);

  const tradeSummary = useMemo(() => {
    const buys = tradeMarkers?.filter((item) => item.side === "BUY").length ?? 0;
    const sells = tradeMarkers?.filter((item) => item.side === "SELL").length ?? 0;
    return { buys, sells, total: buys + sells };
  }, [tradeMarkers]);

  const visibleCostBasis = useMemo(() => {
    if (costBasisPerShare == null || costBasisPerShare <= 0) return null;
    const candles = toCandlestickData(chartBars);
    return isPriceNearVisibleRange(costBasisPerShare, candles) ? costBasisPerShare : null;
  }, [chartBars, costBasisPerShare]);

  const effectiveUpdatedAt = livePrice?.ts || dataSource?.updatedAt || "";
  const effectiveAgeMs = dataAgeMs(effectiveUpdatedAt);
  const delayedThresholdMs = currentInterval === "1h" ? 2 * 60 * 60 * 1000 : 48 * 60 * 60 * 1000;
  const isDelayed = effectiveAgeMs == null ? true : effectiveAgeMs > delayedThresholdMs;
  const effectiveSource = livePrice?.source || dataSource?.source || "--";
  const effectiveUpstream = livePrice?.source ? "stream" : (dataSource?.upstream || "--");
  const ohlcvComplete = Boolean(dataSource?.completeOhlcv);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.muted,
        fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        panes: {
          separatorColor: COLORS.gridStrong,
          separatorHoverColor: "rgba(43, 182, 255, 0.45)",
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(214, 221, 229, 0.26)",
          labelBackgroundColor: COLORS.panelSoft,
          style: 3,
        },
        horzLine: {
          color: "rgba(214, 221, 229, 0.26)",
          labelBackgroundColor: COLORS.panelSoft,
          style: 3,
        },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: COLORS.faint,
        scaleMargins: { top: 0.08, bottom: 0.06 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 6,
        minBarSpacing: 3,
      },
      localization: {
        locale: "zh-CN",
        priceFormatter: (price: number) => formatPrice(price),
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderVisible: false,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      priceLineColor: "rgba(214, 221, 229, 0.42)",
      priceLineWidth: 1,
      lastValueVisible: true,
    }, 0);

    const maSeries = MA_LINES.map((line) => chart.addSeries(LineSeries, {
      color: line.color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: true,
    }, 0));

    const ema12 = chart.addSeries(LineSeries, {
      color: "#00d1ff",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    }, 0);
    const ema26 = chart.addSeries(LineSeries, {
      color: "#ff9f43",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    }, 0);

    const bollUpper = chart.addSeries(LineSeries, {
      color: "rgba(139, 124, 246, 0.9)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    }, 0);
    const bollMid = chart.addSeries(LineSeries, {
      color: "rgba(247, 181, 0, 0.85)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    }, 0);
    const bollLower = chart.addSeries(LineSeries, {
      color: "rgba(139, 124, 246, 0.9)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    }, 0);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
      base: 0,
    }, 1);

    const macdHistogram = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      base: 0,
    }, 2);
    const macdDif = chart.addSeries(LineSeries, {
      color: COLORS.cyan,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, 2);
    const macdDea = chart.addSeries(LineSeries, {
      color: COLORS.amber,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, 2);

    const kdjK = chart.addSeries(LineSeries, {
      color: COLORS.cyan,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, 3);
    const kdjD = chart.addSeries(LineSeries, {
      color: COLORS.amber,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, 3);
    const kdjJ = chart.addSeries(LineSeries, {
      color: COLORS.purple,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, 3);

    applyLowerPaneScale(chart, 1);
    applyLowerPaneScale(chart, 2);
    applyLowerPaneScale(chart, 3);
    applyPaneHeights(chart, indicatorVisibility);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    macdHistogramRef.current = macdHistogram;
    macdDifRef.current = macdDif;
    macdDeaRef.current = macdDea;
    kdjKRef.current = kdjK;
    kdjDRef.current = kdjD;
    kdjJRef.current = kdjJ;
    maSeriesRefs.current = maSeries;
    emaSeriesRefs.current = [ema12, ema26];
    bollSeriesRefs.current = [bollUpper, bollMid, bollLower];

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setCrosshairData(null);
        return;
      }
      const candleData = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const volumeData = param.seriesData.get(volumeSeries) as HistogramData | undefined;
      if (!candleData || !("open" in candleData)) return;

      const change = candleData.close - candleData.open;
      const changePct = candleData.open > 0 ? (change / candleData.open) * 100 : 0;
      setCrosshairData({
        date: String(param.time),
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
        volume: volumeData?.value ?? 0,
        change,
        changePct,
      });
    });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.resize(entry.contentRect.width, entry.contentRect.height);
      applyPaneHeights(chart, indicatorVisibility);
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (markersPluginRef.current) {
        markersPluginRef.current.detach();
        markersPluginRef.current = null;
      }
      costLineRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      macdHistogramRef.current = null;
      macdDifRef.current = null;
      macdDeaRef.current = null;
      kdjKRef.current = null;
      kdjDRef.current = null;
      kdjJRef.current = null;
      maSeriesRefs.current = [];
      emaSeriesRefs.current = [];
      bollSeriesRefs.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({
      timeVisible: currentInterval === "1h",
      secondsVisible: false,
    });
  }, [currentInterval]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const candles = toCandlestickData(chartBars);
    const volumes = toVolumeData(chartBars);
    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volumes);
    volumeSeriesRef.current.applyOptions({ visible: indicatorVisibility.volume });

    indicatorData.ma.forEach((line, index) => {
      const series = maSeriesRefs.current[index];
      if (!series) return;
      series.setData(line.data);
      series.applyOptions({ visible: indicatorVisibility.ma });
    });

    const [ema12, ema26] = emaSeriesRefs.current;
    ema12?.setData(indicatorData.ema12);
    ema12?.applyOptions({ visible: indicatorVisibility.ema });
    ema26?.setData(indicatorData.ema26);
    ema26?.applyOptions({ visible: indicatorVisibility.ema });

    const [bollUpper, bollMid, bollLower] = bollSeriesRefs.current;
    bollUpper?.setData(indicatorData.boll.upper);
    bollUpper?.applyOptions({ visible: indicatorVisibility.boll });
    bollMid?.setData(indicatorData.boll.mid);
    bollMid?.applyOptions({ visible: indicatorVisibility.boll });
    bollLower?.setData(indicatorData.boll.lower);
    bollLower?.applyOptions({ visible: indicatorVisibility.boll });

    macdHistogramRef.current?.setData(indicatorData.macd.histogram);
    macdHistogramRef.current?.applyOptions({ visible: indicatorVisibility.macd });
    macdDifRef.current?.setData(indicatorData.macd.dif);
    macdDifRef.current?.applyOptions({ visible: indicatorVisibility.macd });
    macdDeaRef.current?.setData(indicatorData.macd.dea);
    macdDeaRef.current?.applyOptions({ visible: indicatorVisibility.macd });

    kdjKRef.current?.setData(indicatorData.kdj.k);
    kdjKRef.current?.applyOptions({ visible: indicatorVisibility.kdj });
    kdjDRef.current?.setData(indicatorData.kdj.d);
    kdjDRef.current?.applyOptions({ visible: indicatorVisibility.kdj });
    kdjJRef.current?.setData(indicatorData.kdj.j);
    kdjJRef.current?.applyOptions({ visible: indicatorVisibility.kdj });

    if (markersPluginRef.current) {
      markersPluginRef.current.detach();
      markersPluginRef.current = null;
    }
    if (tradeMarkers?.length && candleSeriesRef.current) {
      const dayMap = new Map<string, { buys: number; sells: number }>();
      for (const marker of tradeMarkers) {
        const markerTime = resolveMarkerTime(marker.date, chartBars);
        if (!markerTime) continue;
        const entry = dayMap.get(markerTime) ?? { buys: 0, sells: 0 };
        if (marker.side === "BUY") entry.buys += marker.qty;
        else entry.sells += marker.qty;
        dayMap.set(markerTime, entry);
      }

      const markerData = [...dayMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([date, aggregate]) => {
          const items: Array<{
            time: Time;
            position: "belowBar" | "aboveBar";
            color: string;
            shape: "circle" | "arrowUp" | "arrowDown";
            size: number;
            text: string;
          }> = [];
          if (aggregate.buys > 0) {
            items.push({
              time: date as Time,
              position: "belowBar",
              color: COLORS.up,
              shape: "arrowUp",
              size: 1.25,
              text: `买 ${aggregate.buys.toFixed(2)}`,
            });
          }
          if (aggregate.sells > 0) {
            items.push({
              time: date as Time,
              position: "aboveBar",
              color: COLORS.down,
              shape: "arrowDown",
              size: 1.25,
              text: `卖 ${aggregate.sells.toFixed(2)}`,
            });
          }
          return items;
        });

      if (markerData.length > 0) {
        markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markerData);
      }
    }

    if (costLineRef.current && candleSeriesRef.current) {
      candleSeriesRef.current.removePriceLine(costLineRef.current);
      costLineRef.current = null;
    }
    if (
      costBasisPerShare != null &&
      costBasisPerShare > 0 &&
      candleSeriesRef.current &&
      isPriceNearVisibleRange(costBasisPerShare, candles)
    ) {
      costLineRef.current = candleSeriesRef.current.createPriceLine({
        price: costBasisPerShare,
        color: COLORS.amber,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `成本 ${formatPrice(costBasisPerShare)}`,
      });
    }

    if (chartRef.current) {
      applyPaneHeights(chartRef.current, indicatorVisibility);
      setPaddedVisibleRange(chartRef.current, candles);
    }
  }, [chartBars, indicatorData, indicatorVisibility, tradeMarkers, costBasisPerShare]);

  const toggleIndicator = useCallback((key: IndicatorKey) => {
    setIndicatorVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className={`flex min-h-[520px] flex-col bg-[#050607] text-[#d6dde5] ${className ?? ""}`}>
      <div className="border-b border-[#161b20] bg-[#090d10]">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3">
          <div className="flex items-center gap-5 text-sm font-semibold">
            <button type="button" className="border-b-2 border-[#d6dde5] py-3 text-[#d6dde5]">
              图表
            </button>
          </div>
          <div className="hidden items-center gap-2 font-[var(--font-mono)] text-[11px] text-[#8a939f] lg:flex">
            <span className="rounded-[5px] border border-[#202832] bg-[#050607] px-2 py-1 text-[#d6dde5]">
              价格图
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#111820] px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-[var(--font-mono)] text-[11px] text-[#59636f]">周期</span>
            {TIME_RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={`h-6 min-w-8 rounded-[4px] px-2 font-[var(--font-mono)] text-[11px] transition-colors ${
                  range === item.key
                    ? "bg-[#1a222a] text-white"
                    : "text-[#8a939f] hover:bg-[#10161b] hover:text-[#d6dde5]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {INDICATOR_LABELS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleIndicator(item.key)}
                className={`h-6 rounded-[4px] px-2 font-[var(--font-mono)] text-[11px] transition-colors ${
                  indicatorVisibility[item.key]
                    ? "bg-[#15202a] text-[#d6dde5]"
                    : "text-[#59636f] hover:bg-[#10161b] hover:text-[#8a939f]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="pointer-events-none absolute left-3 top-3 z-[5] max-w-[calc(100%-1.5rem)] space-y-1 rounded-[8px] border border-[#1a222a] bg-[#090d10]/95 px-2.5 py-2 font-[var(--font-mono)] text-[11px] leading-tight shadow-[0_10px_24px_rgba(0,0,0,0.32)] backdrop-blur-sm">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="font-semibold text-[#d6dde5]">{symbol} · {currentInterval.toUpperCase()} · {market || "MARKET"}</span>
            <span className="text-[#8a939f]">开 <b className="font-normal text-[#b8c0ca]">{formatPrice(displayData?.open)}</b></span>
            <span className="text-[#8a939f]">高 <b className="font-normal text-[#00c076]">{formatPrice(displayData?.high)}</b></span>
            <span className="text-[#8a939f]">低 <b className="font-normal text-[#f84960]">{formatPrice(displayData?.low)}</b></span>
            <span className="text-[#8a939f]">收 <b className="font-normal text-[#d6dde5]">{formatPrice(displayData?.close)}</b></span>
            <span className="text-[#8a939f]">量 <b className="font-normal text-[#b8c0ca]">{formatVolume(displayData?.volume)}</b></span>
          </div>
          {indicatorVisibility.ma ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-[#f7b500]">MA5 {formatPrice(displayIndicators.ma5)}</span>
              <span className="text-[#d957ff]">MA10 {formatPrice(displayIndicators.ma10)}</span>
              <span className="text-[#2bb6ff]">MA20 {formatPrice(displayIndicators.ma20)}</span>
              <span className="text-[#8b7cf6]">MA60 {formatPrice(displayIndicators.ma60)}</span>
            </div>
          ) : null}
          {indicatorVisibility.macd ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-[#8a939f]">MACD 12 26 close 9</span>
              <span className="text-[#2bb6ff]">DIF {formatPrice(displayIndicators.macdDif, 3)}</span>
              <span className="text-[#f7b500]">DEA {formatPrice(displayIndicators.macdDea, 3)}</span>
              <span className={indicatorTextColor(displayIndicators.macdHist)}>
                HIST {formatSigned(displayIndicators.macdHist, 3)}
              </span>
            </div>
          ) : null}
          {indicatorVisibility.kdj ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-[#8a939f]">KDJ 9 3 3</span>
              <span className="text-[#2bb6ff]">K {formatPrice(displayIndicators.kdjK)}</span>
              <span className="text-[#f7b500]">D {formatPrice(displayIndicators.kdjD)}</span>
              <span className="text-[#8b7cf6]">J {formatPrice(displayIndicators.kdjJ)}</span>
            </div>
          ) : null}
        </div>

        <div className="absolute right-3 top-3 z-[5] hidden max-w-[min(520px,calc(100%-1.5rem))] flex-wrap items-center justify-end gap-1.5 rounded-[8px] border border-[#1a222a] bg-[#090d10]/95 px-2 py-1.5 font-[var(--font-mono)] text-[10px] text-[#8a939f] shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-sm lg:flex">
          <span className="rounded-[5px] border border-[#202832] bg-[#050607] px-1.5 py-0.5" title={`${effectiveSource} · ${effectiveUpstream}`}>
            {effectiveSource} · {effectiveUpstream}
          </span>
          <span className="rounded-[5px] border border-[#202832] bg-[#050607] px-1.5 py-0.5">
            {currentInterval.toUpperCase()} · {dataSource ? `${dataSource.rows}/${dataSource.rawCount}` : "--"}
          </span>
          <span className={`rounded-[5px] border px-1.5 py-0.5 ${isDelayed ? "border-[#5a3a12] bg-[#1a1206] text-[#f7b500]" : "border-[#123827] bg-[#061812] text-[#00c076]"}`}>
            {isDelayed ? "延迟" : "新鲜"} · {formatChartTime(effectiveUpdatedAt, currentInterval)}
          </span>
          <span className={`rounded-[5px] border px-1.5 py-0.5 ${ohlcvComplete ? "border-[#123827] bg-[#061812] text-[#00c076]" : "border-[#5a3a12] bg-[#1a1206] text-[#f7b500]"}`}>
            {ohlcvComplete ? "OHLCV 完整" : "OHLCV 不完整"}
          </span>
          {visibleCostBasis != null ? <span className="text-[#f7b500]">成本 {formatPrice(visibleCostBasis)}</span> : null}
          {tradeSummary.total > 0 ? (
            <span>
              买/卖 <b className="font-normal text-[#d6dde5]">{tradeSummary.buys}/{tradeSummary.sells}</b>
            </span>
          ) : null}
        </div>

        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050607]/92">
            <span className="font-[var(--font-mono)] text-xs text-[#8a939f]">加载行情数据...</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050607]/92">
            <span className="text-sm text-[#8a939f]">{error}</span>
          </div>
        )}
        <div ref={containerRef} className="h-[560px] w-full xl:h-[640px]" />
      </div>
    </div>
  );
}
