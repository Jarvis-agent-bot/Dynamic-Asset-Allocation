"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PriceBar = {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

type RangeKey = "1M" | "3M" | "6M" | "1Y" | "ALL";

const TIME_RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "ALL", label: "全部", days: 0 },
];

/* ------------------------------------------------------------------ */
/*  配色                                                               */
/* ------------------------------------------------------------------ */

const COLORS = {
  bg: "transparent",
  text: "hsl(215 16% 57%)",
  grid: "hsla(215,16%,57%,0.08)",
  crosshair: "hsla(215,16%,57%,0.3)",
  up: "#22c55e",
  down: "#ef4444",
  volumeUp: "rgba(34,197,94,0.2)",
  volumeDown: "rgba(239,68,68,0.2)",
} as const;

/* ------------------------------------------------------------------ */
/*  数据转换                                                           */
/* ------------------------------------------------------------------ */

function toCandlestickData(bars: PriceBar[]): CandlestickData[] {
  return bars
    .filter((b) => b.open != null && b.high != null && b.low != null)
    .map((b) => ({
      time: b.date as Time,
      open: b.open!,
      high: b.high!,
      low: b.low!,
      close: b.close,
    }));
}

function toVolumeData(bars: PriceBar[]): HistogramData[] {
  return bars
    .filter((b) => b.volume != null && b.open != null)
    .map((b) => ({
      time: b.date as Time,
      value: b.volume!,
      color: b.close >= (b.open ?? b.close) ? COLORS.volumeUp : COLORS.volumeDown,
    }));
}

/* ------------------------------------------------------------------ */
/*  组件                                                               */
/* ------------------------------------------------------------------ */

export function AssetKlineChart({
  symbol,
  market,
  className,
}: {
  symbol: string;
  market: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);

  const [range, setRange] = useState<RangeKey>("6M");
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 计算 start 日期
  const startDate = useMemo(() => {
    const days = TIME_RANGES.find((r) => r.key === range)?.days ?? 0;
    if (days <= 0) return undefined;
    const d = new Date(Date.now() - days * 86_400_000);
    return d.toISOString().slice(0, 10);
  }, [range]);

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ symbol });
      if (startDate) qs.set("start", startDate);
      const res = await fetch(`/api/daa/market/yfinance/price-series?${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = json?.data ?? json;
      const series: PriceBar[] = Array.isArray(data.series) ? data.series : [];
      if (series.length === 0) {
        setError("暂无行情数据");
      }
      setBars(series);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载行情失败");
    } finally {
      setLoading(false);
    }
  }, [symbol, startDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // 初始化图表
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.text,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: COLORS.crosshair, labelBackgroundColor: "hsl(222 47% 11%)" },
        horzLine: { color: COLORS.crosshair, labelBackgroundColor: "hsl(222 47% 11%)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Resize 响应
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // 更新数据
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    const candles = toCandlestickData(bars);
    const volumes = toVolumeData(bars);
    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volumes);
    if (candles.length > 0) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [bars]);

  // 最新价/涨跌
  const priceInfo = useMemo(() => {
    if (bars.length < 1) return null;
    const last = bars[bars.length - 1];
    const prev = bars.length >= 2 ? bars[bars.length - 2] : null;
    const change = prev ? last.close - prev.close : 0;
    const changePct = prev && prev.close > 0 ? (change / prev.close) * 100 : 0;
    return { price: last.close, change, changePct, date: last.date };
  }, [bars]);

  return (
    <div className={className}>
      {/* 标题 + 时间范围 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold text-[var(--text)]">
            {market === "US" ? symbol : `${symbol}`}
          </span>
          {priceInfo && (
            <span className="flex items-baseline gap-2">
              <span className="text-base font-medium text-[var(--text)]">
                {priceInfo.price.toFixed(2)}
              </span>
              <span
                className={`text-xs font-medium ${
                  priceInfo.change >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {priceInfo.change >= 0 ? "+" : ""}
                {priceInfo.change.toFixed(2)} ({priceInfo.changePct >= 0 ? "+" : ""}
                {priceInfo.changePct.toFixed(2)}%)
              </span>
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r.key
                  ? "bg-[hsla(199,89%,60%,0.16)] text-[hsl(199,89%,60%)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 图表容器 */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[rgba(8,12,20,0.6)]">
            <span className="text-sm text-[var(--muted)] animate-pulse">加载行情数据…</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg">
            <span className="text-sm text-[var(--faint)]">{error}</span>
          </div>
        )}
        <div
          ref={containerRef}
          className="h-[400px] w-full rounded-lg"
        />
      </div>
    </div>
  );
}
