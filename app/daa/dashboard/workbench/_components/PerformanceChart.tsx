"use client";

import React, { useMemo, useState } from "react";
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

type CashFlowEvent = { ts: string; side: "deposit" | "withdraw"; amount: number };

type BenchmarkPoint = { ts: string; price: number };

type NormalizedPoint = {
  label: string; // MM-DD
  date: string; // YYYY-MM-DD
  portfolio: number; // 归一化 %（100 = 起始）
  benchmark?: number; // 基准归一化 %
};

/**
 * 图表配色常量 — 对应 CSS 变量的静态值。
 * Recharts 部分 prop（tick.fill、contentStyle 等）不支持 CSS var()，
 * 因此在此集中维护，与主题色保持同步。
 */
const CHART_COLORS = {
  /** var(--muted) — 坐标轴刻度文字 */
  muted: "hsl(215 16% 57%)",
  /** var(--foreground) — 工具提示背景 */
  tooltipBg: "hsl(222 47% 11%)",
  /** var(--border) — 工具提示边框 */
  tooltipBorder: "hsla(215,16%,57%,0.2)",
  /** 网格线 */
  grid: "hsla(215,16%,57%,0.12)",
  /** var(--primary) / 主图线 */
  primary: "hsl(199 89% 60%)",
  /** var(--primary) 背景 */
  primaryBgAlpha: "hsla(199,89%,60%,0.16)",
  /** 基准线（SPY） */
  benchmark: "hsl(160 60% 55%)",
} as const;

const TIME_RANGES = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "ALL", label: "全部", days: 0 },
] as const;

type RangeKey = (typeof TIME_RANGES)[number]["key"];

/* ------------------------------------------------------------------ */
/*  TWR（时间加权收益率）归一化计算                                        */
/* ------------------------------------------------------------------ */

/**
 * 计算 TWR 归一化曲线。
 *
 * 在每个现金流事件（入金/出金）处切分区间，各区间独立计算子收益率，
 * 再用连乘公式 ∏(1 + r_i) 得到累计 TWR，最终归一化到 100 基准。
 *
 * 这样入金/出金不会影响收益率，只有投资收益会反映在曲线中。
 */
function normalizeSnapshots(
  snapshots: Snapshot[],
  days: number,
  benchmarkData?: BenchmarkPoint[],
  cashFlowEvents?: CashFlowEvent[],
): NormalizedPoint[] {
  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
  );
  const cutoff =
    days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const filtered = cutoff ? sorted.filter((s) => s.ts >= cutoff) : sorted;
  if (filtered.length === 0) return [];

  // 创建基准数据的日期索引
  const benchmarkMap = new Map<string, number>();
  if (benchmarkData && benchmarkData.length > 0) {
    const sortedBench = [...benchmarkData].sort(
      (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
    );
    const benchFiltered = cutoff ? sortedBench.filter((b) => b.ts >= cutoff) : sortedBench;
    if (benchFiltered.length > 0) {
      const benchBase = benchFiltered[0].price > 0 ? benchFiltered[0].price : 1;
      for (const bp of benchFiltered) {
        const dateKey = bp.ts.slice(0, 10);
        benchmarkMap.set(dateKey, +((bp.price / benchBase) * 100).toFixed(2));
      }
    }
  }

  // 构建按时间排序的现金流 map（按日期聚合净现金流）
  const cfMap = new Map<string, number>();
  if (cashFlowEvents && cashFlowEvents.length > 0) {
    for (const cf of cashFlowEvents) {
      const dateKey = cf.ts.slice(0, 10);
      const prev = cfMap.get(dateKey) ?? 0;
      const signed = cf.side === "deposit" ? cf.amount : -cf.amount;
      cfMap.set(dateKey, prev + signed);
    }
  }

  // TWR 计算：对每个快照计算累计 TWR 因子
  // cumFactor 从 1 开始，代表每单位初始投资的增长倍数
  let cumFactor = 1;
  let prevEquity = filtered[0].totalEquity;

  return filtered.map((snap, i) => {
    const dateKey = snap.ts.slice(0, 10);

    if (i === 0) {
      // 第一个点：基准 100
      const point: NormalizedPoint = {
        label: snap.ts.slice(5, 10),
        date: dateKey,
        portfolio: 100,
      };
      const benchVal = benchmarkMap.get(dateKey);
      if (benchVal != null) point.benchmark = benchVal;
      prevEquity = snap.totalEquity;
      return point;
    }

    // 本区间的净现金流（在本日期发生的入金/出金）
    const netCashFlow = cfMap.get(dateKey) ?? 0;

    // 子区间收益率：(当前 equity - 本期净现金流) / 上期 equity - 1
    // 含义：如果没有现金流入，本期 equity 应该是多少
    const adjEquity = snap.totalEquity - netCashFlow;
    const subReturn = prevEquity > 0 ? adjEquity / prevEquity : 1;
    cumFactor *= subReturn;

    // 更新 prevEquity 为本期实际 equity（包含现金流后的值）
    prevEquity = snap.totalEquity;

    const point: NormalizedPoint = {
      label: snap.ts.slice(5, 10),
      date: dateKey,
      portfolio: +(cumFactor * 100).toFixed(2),
    };
    const benchVal = benchmarkMap.get(dateKey);
    if (benchVal != null) point.benchmark = benchVal;
    return point;
  });
}

/* ------------------------------------------------------------------ */
/*  组件                                                               */
/* ------------------------------------------------------------------ */

export const PerformanceChart = React.memo(function PerformanceChart(props: {
  snapshots: Snapshot[];
  cashFlowEvents?: CashFlowEvent[];
  benchmarkData?: BenchmarkPoint[];
  benchmarkLabel?: string;
  className?: string;
}) {
  const { snapshots, cashFlowEvents, benchmarkData, benchmarkLabel = "SPY", className } = props;
  const [range, setRange] = useState<RangeKey>("ALL");

  const selectedDays = useMemo(
    () => TIME_RANGES.find((r) => r.key === range)?.days ?? 0,
    [range],
  );

  const data = useMemo(
    () => normalizeSnapshots(snapshots, selectedDays, benchmarkData, cashFlowEvents),
    [snapshots, selectedDays, benchmarkData, cashFlowEvents],
  );

  const hasBenchmark = useMemo(
    () => data.some((d) => d.benchmark != null),
    [data],
  );

  // 计算收益率
  const returnPct = useMemo(() => {
    if (data.length < 2) return null;
    const last = data[data.length - 1].portfolio;
    return +(last - 100).toFixed(2);
  }, [data]);

  const benchmarkReturnPct = useMemo(() => {
    if (!hasBenchmark || data.length < 2) return null;
    const withBenchmark = data.filter((d) => d.benchmark != null);
    if (withBenchmark.length < 2) return null;
    const last = withBenchmark[withBenchmark.length - 1].benchmark!;
    return +(last - 100).toFixed(2);
  }, [data, hasBenchmark]);

  if (snapshots.length < 2) {
    return (
      <DashboardEmptyState
        title="暂无权益曲线"
        description="入金并完成首次交易后，权益走势图将自动生成。"
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
                  ? "bg-[hsla(199,89%,60%,0.16)] text-[hsl(199,89%,60%)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {returnPct !== null && (
            <span
              className={`text-xs font-medium ${
                returnPct >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              我的组合 {returnPct >= 0 ? "+" : ""}{returnPct}%
            </span>
          )}
          {benchmarkReturnPct !== null && (
            <span
              className={`text-xs font-medium ${
                benchmarkReturnPct >= 0 ? "text-emerald-400/70" : "text-red-400/70"
              }`}
            >
              {benchmarkLabel} {benchmarkReturnPct >= 0 ? "+" : ""}{benchmarkReturnPct}%
            </span>
          )}
        </div>
      </div>

      {/* 图表 */}
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              stroke={CHART_COLORS.grid}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                background: CHART_COLORS.tooltipBg,
                border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                borderRadius: 14,
              }}
              formatter={(value: number | undefined, name?: string) => [
                `${(value ?? 0).toFixed(2)}%`,
                name ?? "",
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
              stroke={CHART_COLORS.primary}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, fill: CHART_COLORS.primary }}
            />
            {hasBenchmark && (
              <Line
                type="monotone"
                dataKey="benchmark"
                name={benchmarkLabel}
                stroke={CHART_COLORS.benchmark}
                strokeWidth={1.6}
                dot={false}
                strokeDasharray="4 2"
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
