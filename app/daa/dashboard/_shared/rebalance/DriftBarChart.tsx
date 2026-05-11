"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, Cell } from "recharts";

type DriftRow = {
  symbol: string;
  gapPct: number | null;
  targetWeightHint: number;
  watchEnabled: boolean;
};

const CHART_COLORS = {
  over: "hsl(142 71% 45%)",    // green - overweight
  under: "hsl(0 84% 60%)",     // red - underweight
  grid: "hsla(215,16%,57%,0.1)",
  axis: "hsl(215 16% 57%)",
  tooltipBg: "hsl(222 47% 11%)",
  tooltipBorder: "hsla(215,16%,57%,0.2)",
};

export type DriftBarChartProps = {
  rows: DriftRow[];
  driftThresholdPct?: number;
  maxItems?: number;
};

export function DriftBarChart(props: DriftBarChartProps) {
  const { driftThresholdPct = 5, maxItems = 15 } = props;

  const chartData = useMemo(() => {
    return props.rows
      .filter((r) => r.watchEnabled && r.targetWeightHint > 0 && r.gapPct != null)
      .map((r) => ({
        symbol: r.symbol,
        drift: Number((r.gapPct ?? 0).toFixed(2)),
      }))
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
      .slice(0, maxItems);
  }, [props.rows, maxItems]);

  if (chartData.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
        持仓偏移分布
      </div>
      <ResponsiveContainer width="100%" height={Math.max(chartData.length * 28 + 40, 120)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 50, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            type="category"
            dataKey="symbol"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            width={48}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: CHART_COLORS.tooltipBg,
              border: `1px solid ${CHART_COLORS.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              color: "#e2e8f0",
            }}
            itemStyle={{ color: "#e2e8f0" }}
            labelStyle={{ color: "#94a3b8" }}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            formatter={(value: number | undefined) => [`${(value ?? 0) > 0 ? "+" : ""}${(value ?? 0).toFixed(2)}%`, "偏移"]}
          />
          <ReferenceLine x={driftThresholdPct} stroke="hsla(45,93%,55%,0.4)" strokeDasharray="4 4" label={{ value: `+${driftThresholdPct}%`, fill: "hsl(45 93% 55%)", fontSize: 10, position: "top" }} />
          <ReferenceLine x={-driftThresholdPct} stroke="hsla(45,93%,55%,0.4)" strokeDasharray="4 4" label={{ value: `-${driftThresholdPct}%`, fill: "hsl(45 93% 55%)", fontSize: 10, position: "top" }} />
          <ReferenceLine x={0} stroke="hsla(215,16%,57%,0.3)" />
          <Bar dataKey="drift" radius={[0, 4, 4, 0]} barSize={16}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.drift >= 0 ? CHART_COLORS.over : CHART_COLORS.under} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
