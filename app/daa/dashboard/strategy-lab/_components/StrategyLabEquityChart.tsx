"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { DashboardEmptyState } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { DaaSurfacePanel } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { StrategyLabStrategyResult } from "@/src/daa/modules/strategyLab/strategyLabTypes";
import { strategyLabel } from "./useStrategyLab";

const CHART_COLORS = {
  muted: "hsl(215 16% 57%)",
  tooltipBg: "hsl(222 47% 11%)",
  tooltipBorder: "hsla(215,16%,57%,0.2)",
  grid: "hsla(215,16%,57%,0.12)",
} as const;

const STRATEGY_LINE_COLORS: Record<string, string> = {
  equalWeight: "hsl(199 89% 60%)",
  momentum: "hsl(43 96% 56%)",
  riskParity: "hsl(160 60% 55%)",
  minVariance: "hsl(280 65% 65%)",
  baseline: "hsl(215 16% 57%)",
};

interface StrategyLabEquityChartProps {
  chartData: Array<Record<string, string | number>>;
  strategyResults: StrategyLabStrategyResult[];
}

export function StrategyLabEquityChart({ chartData, strategyResults }: StrategyLabEquityChartProps) {
  return (
    <DaaSurfacePanel accent="cyan" title="权益曲线" subtitle="回测期间的资产净值走势。">
      {chartData.length >= 2 ? (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={60}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: CHART_COLORS.tooltipBg,
                  border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                  borderRadius: 14,
                }}
                formatter={(value: number | undefined) => [
                  `$${(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  "净值",
                ]}
                labelFormatter={(label: unknown) => `${String(label)}`}
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
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <DashboardEmptyState title="数据点不足" description="权益曲线至少需要两个数据点。" className="py-10" />
      )}
    </DaaSurfacePanel>
  );
}
