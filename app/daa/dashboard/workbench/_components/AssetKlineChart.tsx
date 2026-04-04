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

type RangeKey = "5D" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y";

const TIME_RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "5D", label: "5日", days: 10 },
  { key: "1M", label: "1月", days: 30 },
  { key: "3M", label: "3月", days: 90 },
  { key: "6M", label: "6月", days: 180 },
  { key: "1Y", label: "1年", days: 365 },
  { key: "2Y", label: "2年", days: 730 },
  { key: "5Y", label: "5年", days: 1825 },
];

type MaConfig = { period: number; color: string; visible: boolean };

const DEFAULT_MA_CONFIGS: MaConfig[] = [
  { period: 5, color: "#f59e0b", visible: true },   // MA5 — 黄色
  { period: 10, color: "#ec4899", visible: true },   // MA10 — 粉色
  { period: 20, color: "#38bdf8", visible: true },   // MA20 — 蓝色
  { period: 60, color: "#a78bfa", visible: false },  // MA60 — 紫色
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
/*  数据转换 & 技术指标计算                                              */
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

/** 计算简单移动平均线 */
function computeMA(bars: PriceBar[], period: number): LineData[] {
  const result: LineData[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    result.push({ time: bars[i].date as Time, value: +(sum / period).toFixed(4) });
  }
  return result;
}

/** 格式化成交量 */
function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return v.toFixed(0);
}

/* ------------------------------------------------------------------ */
/*  组件                                                               */
/* ------------------------------------------------------------------ */

export type KlineTradeMarker = {
  date: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
};

export function AssetKlineChart({
  symbol,
  market,
  className,
  tradeMarkers,
  costBasisPerShare,
}: {
  symbol: string;
  market: string;
  className?: string;
  /** 交易标记（买卖点） */
  tradeMarkers?: KlineTradeMarker[];
  /** 成本价（单价），用于画水平线 */
  costBasisPerShare?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maSeriesRefs = useRef<ISeriesApi<any>[]>([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const costLineRef = useRef<IPriceLine | null>(null);

  const [range, setRange] = useState<RangeKey>("6M");
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [maConfigs, setMaConfigs] = useState<MaConfig[]>(DEFAULT_MA_CONFIGS);

  // 鼠标悬停时的十字光标数据
  const [crosshairData, setCrosshairData] = useState<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    change: number;
    changePct: number;
  } | null>(null);

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
      if (!res.ok) {
        if (res.status === 401) throw new Error("登录已过期，请刷新页面重新登录");
        if (res.status === 502) throw new Error("行情数据源暂时不可用，请稍后重试");
        throw new Error(`请求失败 (${res.status})`);
      }
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
      localization: {
        locale: "zh-CN",
        priceFormatter: (price: number) => price.toFixed(2),
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

    // 添加 MA 均线
    const maSeries: ISeriesApi<any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const ma of DEFAULT_MA_CONFIGS) {
      const series = chart.addSeries(LineSeries, {
        color: ma.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: ma.visible,
      });
      maSeries.push(series);
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    maSeriesRefs.current = maSeries;

    // 十字光标数据同步
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setCrosshairData(null);
        return;
      }
      const candleData = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const volData = param.seriesData.get(volumeSeries) as HistogramData | undefined;
      if (candleData && "open" in candleData) {
        const change = candleData.close - candleData.open;
        const changePct = candleData.open > 0 ? (change / candleData.open) * 100 : 0;
        setCrosshairData({
          date: String(param.time),
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value ?? 0,
          change,
          changePct,
        });
      }
    });

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
      if (markersPluginRef.current) {
        markersPluginRef.current.detach();
        markersPluginRef.current = null;
      }
      costLineRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      maSeriesRefs.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 更新数据
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    const candles = toCandlestickData(bars);
    const volumes = toVolumeData(bars);
    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volumes);

    // 更新 MA 均线数据
    maConfigs.forEach((ma, idx) => {
      const series = maSeriesRefs.current[idx];
      if (!series) return;
      if (ma.visible && bars.length >= ma.period) {
        series.setData(computeMA(bars, ma.period));
        series.applyOptions({ visible: true });
      } else {
        series.setData([]);
        series.applyOptions({ visible: false });
      }
    });

    // 交易标记（BUY 绿色向上三角 / SELL 红色向下三角）
    if (markersPluginRef.current) {
      markersPluginRef.current.detach();
      markersPluginRef.current = null;
    }
    if (tradeMarkers?.length && candleSeriesRef.current) {
      const barDates = new Set(bars.map((b) => b.date));
      // 同一天可能有多笔交易，合并显示
      const dayMap = new Map<string, { buys: number; sells: number }>();
      for (const m of tradeMarkers) {
        if (!barDates.has(m.date)) continue;
        const entry = dayMap.get(m.date) ?? { buys: 0, sells: 0 };
        if (m.side === "BUY") entry.buys += m.qty;
        else entry.sells += m.qty;
        dayMap.set(m.date, entry);
      }
      // 交易所风格：小圆点标记在 K 线上方/下方，不显示文字避免遮挡
      const markerData = [...dayMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([date, agg]) => {
          const out: Array<{
            time: Time;
            position: "belowBar" | "aboveBar";
            color: string;
            shape: "circle" | "arrowUp" | "arrowDown";
            size: number;
            text: string;
          }> = [];
          if (agg.buys > 0) {
            out.push({
              time: date as Time,
              position: "belowBar",
              color: "#22c55e",
              shape: "circle",
              size: 0.5,
              text: `B ${agg.buys.toFixed(2)}`,
            });
          }
          if (agg.sells > 0) {
            out.push({
              time: date as Time,
              position: "aboveBar",
              color: "#ef4444",
              shape: "circle",
              size: 0.5,
              text: `S ${agg.sells.toFixed(2)}`,
            });
          }
          return out;
        });
      if (markerData.length > 0) {
        markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markerData);
      }
    }

    // 成本价水平线
    if (costLineRef.current && candleSeriesRef.current) {
      candleSeriesRef.current.removePriceLine(costLineRef.current);
      costLineRef.current = null;
    }
    if (costBasisPerShare != null && costBasisPerShare > 0 && candleSeriesRef.current) {
      costLineRef.current = candleSeriesRef.current.createPriceLine({
        price: costBasisPerShare,
        color: "hsl(45 93% 47%)",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `成本 ${costBasisPerShare.toFixed(2)}`,
      });
    }

    if (candles.length > 0) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [bars, maConfigs, tradeMarkers, costBasisPerShare]);

  // 切换 MA 可见性
  const toggleMA = useCallback((period: number) => {
    setMaConfigs((prev) =>
      prev.map((ma) => (ma.period === period ? { ...ma, visible: !ma.visible } : ma)),
    );
  }, []);

  // 最新价/涨跌
  const priceInfo = useMemo(() => {
    if (bars.length < 1) return null;
    const last = bars[bars.length - 1];
    const prev = bars.length >= 2 ? bars[bars.length - 2] : null;
    const change = prev ? last.close - prev.close : 0;
    const changePct = prev && prev.close > 0 ? (change / prev.close) * 100 : 0;
    return {
      price: last.close,
      change,
      changePct,
      date: last.date,
      high: last.high ?? last.close,
      low: last.low ?? last.close,
      volume: last.volume ?? 0,
    };
  }, [bars]);

  // 显示十字光标数据或最新价
  const displayData = crosshairData ?? (priceInfo ? {
    date: priceInfo.date,
    open: bars[bars.length - 1]?.open ?? priceInfo.price,
    high: priceInfo.high,
    low: priceInfo.low,
    close: priceInfo.price,
    volume: priceInfo.volume,
    change: priceInfo.change,
    changePct: priceInfo.changePct,
  } : null);

  return (
    <div className={className}>
      {/* ── 顶部信息栏 ── */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-lg font-semibold text-[var(--text)]">{symbol}</span>
          {displayData && (
            <>
              <span className="text-base font-medium text-[var(--text)]">
                {displayData.close.toFixed(2)}
              </span>
              <span
                className={`text-xs font-medium ${
                  displayData.change >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {displayData.change >= 0 ? "+" : ""}
                {displayData.change.toFixed(2)} ({displayData.changePct >= 0 ? "+" : ""}
                {displayData.changePct.toFixed(2)}%)
              </span>
            </>
          )}
        </div>
        {/* 时间范围选择 */}
        <div className="flex gap-0.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
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

      {/* ── OHLCV 数据行 ── */}
      {displayData && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-[var(--font-mono)] text-[var(--faint)]">
          <span>开 <span className="text-[var(--muted)]">{displayData.open.toFixed(2)}</span></span>
          <span>高 <span className="text-emerald-400/70">{displayData.high.toFixed(2)}</span></span>
          <span>低 <span className="text-red-400/70">{displayData.low.toFixed(2)}</span></span>
          <span>收 <span className="text-[var(--text)]">{displayData.close.toFixed(2)}</span></span>
          <span>量 <span className="text-[var(--muted)]">{formatVolume(displayData.volume)}</span></span>
        </div>
      )}

      {/* ── MA 均线图例 ── */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {maConfigs.map((ma) => (
          <button
            key={ma.period}
            type="button"
            onClick={() => toggleMA(ma.period)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity ${
              ma.visible ? "opacity-100" : "opacity-40"
            }`}
          >
            <span
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ backgroundColor: ma.color }}
            />
            MA{ma.period}
          </button>
        ))}
      </div>

      {/* ── 图表容器 ── */}
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
          className="h-[420px] w-full rounded-lg"
        />
      </div>
    </div>
  );
}
