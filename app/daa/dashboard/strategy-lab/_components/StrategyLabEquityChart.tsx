"use client";

import { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { DashboardEmptyState } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { DaaSurfacePanel } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { daaChartTooltipContentStyle, daaChartTooltipItemStyle, daaChartTooltipLabelStyle } from "@/app/daa/dashboard/_shared/chartTooltipStyles";
import type {
  StrategyLabBenchmarkResult,
  StrategyLabStrategyResult,
} from "@/src/daa/modules/strategyLab/strategyLabTypes";
import { strategyLabBenchmarkDataKey } from "./strategyLabChartData";
import {
  formatStrategyLabCurrencyTick,
  formatStrategyLabCurrencyTooltipValue,
} from "./strategyLabMoneyFormat";
import { strategyLabel } from "./useStrategyLab";

const CHART_COLORS = {
  muted: "hsl(215 16% 57%)",
  grid: "hsla(215,16%,57%,0.12)",
} as const;

const STRATEGY_LINE_COLORS: Record<string, string> = {
  equalWeight: "hsl(199 89% 60%)",
  momentum: "hsl(43 96% 56%)",
  riskParity: "hsl(160 60% 55%)",
  minVariance: "hsl(280 65% 65%)",
  baseline: "hsl(215 16% 57%)",
};

const BENCHMARK_LINE_COLORS: Record<string, string> = {
  SPY: "hsl(160 60% 55%)",
  QQQ: "hsl(334 74% 62%)",
};

interface StrategyLabEquityChartProps {
  baseCurrency: string;
  chartData: Array<Record<string, string | number>>;
  strategyResults: StrategyLabStrategyResult[];
  benchmarkResults: StrategyLabBenchmarkResult[];
}

export function StrategyLabEquityChart({
  baseCurrency,
  chartData,
  strategyResults,
  benchmarkResults,
}: StrategyLabEquityChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const fallbackWidth = typeof window === "undefined"
    ? 640
    : Math.max(320, Math.min(960, Math.floor(window.innerWidth || 640) - 48));
  const chartWidth = chartSize.width > 0 ? chartSize.width : fallbackWidth;
  const chartHeight = chartSize.height > 0 ? chartSize.height : 300;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const nextWidth = Math.max(0, Math.floor(element.clientWidth));
      const nextHeight = Math.max(0, Math.floor(element.clientHeight));
      setChartSize((prev) => (
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      ));
    };

    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, [chartData.length]);

  return (
    <DaaSurfacePanel accent="cyan" title="权益曲线" subtitle="回测期间的组合净值走势，含基准对比。" className="min-w-0" bodyClassName="min-w-0">
      {chartData.length >= 2 ? (
        <div ref={containerRef} className="h-[300px] min-w-0 w-full">
          <LineChart width={chartWidth} height={chartHeight} data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: string) => String(value).slice(5, 10)}
            />
            <YAxis
              tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
              domain={[(min: number) => Math.floor(min * 0.995), (max: number) => Math.ceil(max * 1.005)]}
              tickFormatter={(v: number) => formatStrategyLabCurrencyTick(v, baseCurrency)}
            />
            <Tooltip
              contentStyle={daaChartTooltipContentStyle}
              itemStyle={daaChartTooltipItemStyle}
              labelStyle={daaChartTooltipLabelStyle}
              cursor={{ stroke: "hsla(199,89%,60%,0.28)", strokeDasharray: "4 4" }}
              formatter={(value: number | undefined, name?: string) => [
                formatStrategyLabCurrencyTooltipValue(value, baseCurrency),
                name ?? "净值",
              ]}
              labelFormatter={(label: unknown) => `日期: ${String(label)}`}
            />
            <Legend verticalAlign="bottom" height={28} iconType="line" wrapperStyle={{ fontSize: 11 }} />
            {strategyResults.map((item) => (
              <Line
                key={item.strategy}
                type="monotone"
                dataKey={item.strategy}
                name={strategyLabel(item.strategy)}
                stroke={STRATEGY_LINE_COLORS[item.strategy] || STRATEGY_LINE_COLORS.equalWeight}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
            {benchmarkResults.map((item) => (
              <Line
                key={item.symbol}
                type="monotone"
                dataKey={strategyLabBenchmarkDataKey(item.symbol)}
                name={item.label}
                stroke={BENCHMARK_LINE_COLORS[item.symbol] || CHART_COLORS.muted}
                strokeWidth={1.7}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </div>
      ) : (
        <DashboardEmptyState title="数据点不足" description="权益曲线至少需要两个数据点。" className="py-10" />
      )}
    </DaaSurfacePanel>
  );
}
