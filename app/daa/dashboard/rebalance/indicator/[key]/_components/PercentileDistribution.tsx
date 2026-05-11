"use client";

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import type { Formatter, NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

const COLORS = {
  bar: "hsla(199,89%,60%,0.4)",
  barHighlight: "hsl(199 89% 60%)",
  muted: "hsl(215 16% 57%)",
  grid: "hsla(215,16%,57%,0.12)",
  tooltipBg: "hsl(222 47% 11%)",
};

type Bin = { min: number; max: number; count: number };

function toTooltipNumber(value: ValueType | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function PercentileDistribution(props: {
  bins: Bin[];
  currentBin: number;
  currentValue: number | null;
  percentile: number;
  unit: string;
}) {
  if (props.bins.length === 0) {
    return <div className="py-6 text-center text-xs text-[var(--muted)]">分布数据不足</div>;
  }

  const data = props.bins.map((b, i) => ({
    label: `${b.min.toFixed(1)}`,
    count: b.count,
    isHighlight: i === props.currentBin,
  }));
  const tooltipFormatter: Formatter<ValueType, NameType> = (value) => [`${toTooltipNumber(value)} 天`, "频率"];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-[var(--faint)]">
        <span>252 天分布</span>
        <span className="font-[var(--font-mono)]">当前百分位 {props.percentile.toFixed(0)}%</span>
      </div>
      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ backgroundColor: COLORS.tooltipBg, border: "1px solid hsla(215,16%,57%,0.2)", borderRadius: 8, fontSize: 11, color: "#e2e8f0" }}
              formatter={tooltipFormatter}
              labelFormatter={(l) => `区间: ${l}${props.unit}`}
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.isHighlight ? COLORS.barHighlight : COLORS.bar} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
