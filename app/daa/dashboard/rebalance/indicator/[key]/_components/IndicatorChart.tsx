"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { Formatter, NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { daaChartTooltipContentStyle, daaChartTooltipItemStyle, daaChartTooltipLabelStyle } from "@/app/daa/dashboard/_shared/chartTooltipStyles";
import { cn } from "@/lib/utils";

const COLORS = {
  primary: "var(--primary)",
  primaryBg: "var(--primary-bg)",
  muted: "var(--faint)",
  grid: "var(--border)",
};

const TIME_RANGES = [
  { key: "1M", label: "1月", days: 30 },
  { key: "3M", label: "3月", days: 90 },
  { key: "6M", label: "6月", days: 180 },
  { key: "1Y", label: "1年", days: 365 },
] as const;

type RangeKey = (typeof TIME_RANGES)[number]["key"];

function toTooltipNumber(value: ValueType | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function IndicatorChart(props: {
  series: Array<{ date: string; value: number }>;
  label: string;
  unit: string;
}) {
  const [range, setRange] = useState<RangeKey>("6M");

  const data = useMemo(() => {
    const days = TIME_RANGES.find((timeRange) => timeRange.key === range)?.days ?? 180;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return props.series
      .filter((point) => point.date >= cutoff)
      .map((point) => ({ label: point.date.slice(5), date: point.date, value: point.value }));
  }, [props.series, range]);

  const changePct = useMemo(() => {
    if (data.length < 2) return null;
    const first = data[0].value;
    const last = data[data.length - 1].value;
    return first > 0 ? ((last - first) / first) * 100 : null;
  }, [data]);

  if (data.length < 2) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--muted)]">
        数据不足，暂不绘制指标曲线。
      </div>
    );
  }

  const tooltipFormatter: Formatter<ValueType, NameType> = (value) => [`${toTooltipNumber(value).toFixed(4)} ${props.unit}`, props.label];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1">
          {TIME_RANGES.map((timeRange) => (
            <button
              key={timeRange.key}
              type="button"
              onClick={() => setRange(timeRange.key)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
                range === timeRange.key ? "bg-[var(--primary-bg)] text-[var(--primary)]" : "text-[var(--muted)] hover:text-[var(--text)]",
              )}
            >
              {timeRange.label}
            </button>
          ))}
        </div>
        {changePct != null ? (
          <span className={cn("text-xs font-medium", changePct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
            {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
          </span>
        ) : null}
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fill: COLORS.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={50}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(props.unit === "x" ? 2 : 1)}${props.unit === "%" ? "%" : ""}`}
            />
            <Tooltip
              contentStyle={daaChartTooltipContentStyle}
              itemStyle={daaChartTooltipItemStyle}
              labelStyle={daaChartTooltipLabelStyle}
              formatter={tooltipFormatter}
              labelFormatter={(label) => `日期: ${label}`}
            />
            <Line type="monotone" dataKey="value" stroke={COLORS.primary} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
