"use client";

import { useMemo, useState } from "react";
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Snapshot = { ts: string; totalEquity: number };

type NormalizedPoint = {
  label: string; // MM-DD
  date: string; // YYYY-MM-DD
  portfolio: number; // 归一化 %（100 = 起始）
};

const TIME_RANGES = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "ALL", label: "全部", days: 0 },
] as const;

type RangeKey = (typeof TIME_RANGES)[number]["key"];

/* ------------------------------------------------------------------ */
/*  归一化计算                                                          */
/* ------------------------------------------------------------------ */

function normalizeSnapshots(
  snapshots: Snapshot[],
  days: number,
): NormalizedPoint[] {
  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
  );
  const cutoff =
    days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const filtered = cutoff ? sorted.filter((s) => s.ts >= cutoff) : sorted;
  if (filtered.length === 0) return [];

  const base = filtered[0].totalEquity > 0 ? filtered[0].totalEquity : 1;
  return filtered.map((snap) => ({
    label: snap.ts.slice(5, 10),
    date: snap.ts.slice(0, 10),
    portfolio: +((snap.totalEquity / base) * 100).toFixed(2),
  }));
}

/* ------------------------------------------------------------------ */
/*  组件                                                               */
/* ------------------------------------------------------------------ */

export function PerformanceChart(props: {
  snapshots: Snapshot[];
  className?: string;
}) {
  const { snapshots, className } = props;
  const [range, setRange] = useState<RangeKey>("ALL");

  const selectedDays = useMemo(
    () => TIME_RANGES.find((r) => r.key === range)?.days ?? 0,
    [range],
  );

  const data = useMemo(
    () => normalizeSnapshots(snapshots, selectedDays),
    [snapshots, selectedDays],
  );

  // 计算收益率
  const returnPct = useMemo(() => {
    if (data.length < 2) return null;
    const last = data[data.length - 1].portfolio;
    return +(last - 100).toFixed(2);
  }, [data]);

  if (snapshots.length < 2) {
    return (
      <DashboardEmptyState
        title="暂无权益曲线"
        description="V2 账本启用后，新的权益快照会在入金、交易和后续运行中逐步积累。"
        className={`border-0 bg-transparent px-0 py-10 ${className ?? ""}`}
      />
    );
  }

  return (
    <div className={className}>
      {/* 时间范围选择器 + 收益率 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r.key
                  ? "bg-[rgba(56,189,248,0.16)] text-[#38BDF8]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {returnPct !== null && (
          <span
            className={`text-xs font-medium ${
              returnPct >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {returnPct >= 0 ? "+" : ""}
            {returnPct}%
          </span>
        )}
      </div>

      {/* 图表 */}
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              stroke="rgba(148,163,184,0.12)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94A3B8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "#94A3B8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                background: "#0F172A",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 14,
              }}
              formatter={(value: number | undefined) => [
                `${(value ?? 0).toFixed(2)}%`,
                "我的组合",
              ]}
              labelFormatter={(label: unknown) => `日期: ${String(label)}`}
            />
            <Legend
              verticalAlign="bottom"
              height={28}
              iconType="line"
              wrapperStyle={{ fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              name="我的组合"
              stroke="#38BDF8"
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, fill: "#38BDF8" }}
            />
            {/* 未来添加基准线：
            <Line type="monotone" dataKey="spy" name="SPY" stroke="#34D399" strokeWidth={1.6} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="balanced" name="60/40" stroke="#FBBF24" strokeWidth={1.6} dot={false} strokeDasharray="4 2" />
            */}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
