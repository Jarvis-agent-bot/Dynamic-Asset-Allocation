"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { daaChartTooltipContentStyle, daaChartTooltipItemStyle, daaChartTooltipLabelStyle } from "@/app/daa/dashboard/_shared/chartTooltipStyles";

type DriftRow = {
  symbol: string;
  gapPct: number | null;
  targetWeightHint: number;
  watchEnabled: boolean;
};

const CHART_COLORS = {
  over: "var(--success)",
  under: "var(--danger)",
  grid: "var(--border)",
  axis: "var(--faint)",
  threshold: "var(--primary)",
  thresholdLine: "var(--primary-border)",
  zeroLine: "var(--border-strong)",
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
      .filter((row) => row.watchEnabled && row.targetWeightHint > 0 && row.gapPct != null)
      .map((row) => ({
        symbol: row.symbol,
        drift: Number((row.gapPct ?? 0).toFixed(2)),
      }))
      .sort((leftDrift, rightDrift) => Math.abs(rightDrift.drift) - Math.abs(leftDrift.drift))
      .slice(0, maxItems);
  }, [props.rows, maxItems]);

  if (chartData.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-normal text-[var(--faint)]">
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
            contentStyle={{ ...daaChartTooltipContentStyle, fontSize: 12 }}
            itemStyle={daaChartTooltipItemStyle}
            labelStyle={daaChartTooltipLabelStyle}
            cursor={{ fill: "var(--elevated)" }}
            formatter={(value: number | undefined) => [`${(value ?? 0) > 0 ? "+" : ""}${(value ?? 0).toFixed(2)}%`, "偏移"]}
          />
          <ReferenceLine x={driftThresholdPct} stroke={CHART_COLORS.thresholdLine} strokeDasharray="4 4" label={{ value: `+${driftThresholdPct}%`, fill: CHART_COLORS.threshold, fontSize: 10, position: "top" }} />
          <ReferenceLine x={-driftThresholdPct} stroke={CHART_COLORS.thresholdLine} strokeDasharray="4 4" label={{ value: `-${driftThresholdPct}%`, fill: CHART_COLORS.threshold, fontSize: 10, position: "top" }} />
          <ReferenceLine x={0} stroke={CHART_COLORS.zeroLine} />
          <Bar dataKey="drift" radius={[0, 4, 4, 0]} barSize={16}>
            {chartData.map((entry, entryIndex) => (
              <Cell key={entryIndex} fill={entry.drift >= 0 ? CHART_COLORS.over : CHART_COLORS.under} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
