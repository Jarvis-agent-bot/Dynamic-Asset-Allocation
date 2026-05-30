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

type EquityPoint = {
  label: string;
  date: string;
  equity: number;
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
  /** 基准线（标普500） */
  benchmark: "hsl(160 60% 55%)",
  /** 基准线（纳斯达克100） */
  benchmark2: "hsl(280 55% 62%)",
} as const;

/** 基准 series key → 线条颜色（与后端 BENCHMARK_DEFS 的 key 对应） */
const BENCHMARK_LINE_COLORS: Record<string, string> = {
  benchmarkSpy: CHART_COLORS.benchmark,
  benchmarkQqq: CHART_COLORS.benchmark2,
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

  // 跳过 equity=0 的无效快照（如 ledger_reset 初始状态）
  const meaningful = filtered.filter((s) => s.totalEquity > 0);
  if (meaningful.length === 0) return [];

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
  //
  // 关键：现金流只在对应日期的第一次出现时扣除（"消耗"模式），
  // 避免同一天多条快照重复扣除。第一条快照的日期也不扣除
  // （因为第一条快照本身已经包含了入金后的状态）。
  let cumFactor = 1;
  let prevEquity = meaningful[0].totalEquity;
  const firstDate = meaningful[0].ts.slice(0, 10);
  const consumedDates = new Set<string>();
  // 第一天的现金流不扣除（第一条快照就是入金后的基准）
  consumedDates.add(firstDate);

  return meaningful.map((snap, i) => {
    const dateKey = snap.ts.slice(0, 10);

    if (i === 0) {
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

    // 仅对该日期首次出现时扣除现金流，避免同一天多条快照重复扣除
    let netCashFlow = 0;
    if (!consumedDates.has(dateKey) && cfMap.has(dateKey)) {
      netCashFlow = cfMap.get(dateKey)!;
      consumedDates.add(dateKey);
    }

    // 子区间收益率：(当前 equity - 本期净现金流) / 上期 equity
    const adjEquity = snap.totalEquity - netCashFlow;
    const subReturn = prevEquity > 0 && adjEquity > 0 ? adjEquity / prevEquity : 1;
    cumFactor *= subReturn;
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

/** 构建实际权益金额曲线（不归一化） */
function buildEquityCurve(snapshots: Snapshot[], days: number): EquityPoint[] {
  const sorted = [...snapshots].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const cutoff = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const filtered = cutoff ? sorted.filter((s) => s.ts >= cutoff) : sorted;
  return filtered
    .filter((s) => s.totalEquity > 0)
    .map((s) => ({
      label: s.ts.slice(5, 10),
      date: s.ts.slice(0, 10),
      equity: +s.totalEquity.toFixed(2),
    }));
}

export type PerformanceChartProps = {
  snapshots: Snapshot[];
  cashFlowEvents?: CashFlowEvent[];
  benchmarkData?: BenchmarkPoint[];
  benchmarkLabel?: string;
  className?: string;
  /** "equity" = 实际金额曲线（默认），"twr" = TWR 归一化收益率 */
  mode?: "equity" | "twr";
};

export const PerformanceChart = React.memo(function PerformanceChart(props: PerformanceChartProps) {
  const { snapshots, className } = props;
  // mode 可在图内切换：equity=实际金额，twr=收益率（叠加标普500/纳斯达克100 对比）
  const [mode, setMode] = useState<"equity" | "twr">(props.mode ?? "equity");
  const [range, setRange] = useState<RangeKey>("ALL");
  const [serverData, setServerData] = useState<{
    series: Array<Record<string, unknown>>;
    changePct: number | null;
    lastEquity?: number;
    benchmarks?: Array<{ key: string; label: string; changePct: number | null }>;
  } | null>(null);

  const selectedDays = useMemo(
    () => TIME_RANGES.find((r) => r.key === range)?.days ?? 0,
    [range],
  );

  // 从后端获取预计算的曲线数据
  React.useEffect(() => {
    const params = new URLSearchParams({ mode, days: String(selectedDays) });
    fetch(`/api/daa/read/performance-chart?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = j?.data ?? j;
        if (d?.series) setServerData(d);
      })
      .catch(() => {});
  }, [mode, selectedDays]);

  // 优先用后端数据；后端未就绪时 fallback 到本地计算
  const data = useMemo(() => {
    if (serverData?.series?.length) return serverData.series;
    if (mode === "equity") return buildEquityCurve(snapshots, selectedDays);
    return normalizeSnapshots(snapshots, selectedDays, undefined, props.cashFlowEvents);
  }, [serverData, mode, snapshots, selectedDays, props.cashFlowEvents]);

  // 收益率模式下后端返回的对比基准（标普500 / 纳斯达克100）
  const benchmarks = useMemo(
    () => (mode === "twr" ? serverData?.benchmarks ?? [] : []),
    [mode, serverData],
  );
  const returnPct = useMemo(() => serverData?.changePct ?? null, [serverData]);

  const equityChange = useMemo(() => {
    if (mode !== "equity") return null;
    if (serverData?.lastEquity != null && serverData.changePct != null) {
      return { last: serverData.lastEquity, change: 0, pct: serverData.changePct };
    }
    return null;
  }, [mode, serverData]);

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
        <div className="flex items-center gap-3">
          {/* 金额 / 收益率 模式切换 — 收益率模式下叠加标普500/纳斯达克100 对比 */}
          <div className="flex gap-1 rounded-md bg-[var(--surface)] p-0.5">
            {([
              { key: "equity", label: "金额" },
              { key: "twr", label: "收益率" },
            ] as const).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === m.key
                    ? "bg-[hsla(199,89%,60%,0.16)] text-[hsl(199,89%,60%)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {m.label}
              </button>
            ))}
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
        <div className="flex items-center gap-3">
          {mode === "equity" && equityChange ? (
            <span className={`text-xs font-medium ${equityChange.change >= 0 ? "text-[var(--success)]" : "text-red-400"}`}>
              ${equityChange.last.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({equityChange.pct >= 0 ? "+" : ""}{equityChange.pct.toFixed(2)}%)
            </span>
          ) : null}
          {mode === "twr" && returnPct !== null && (
            <span
              className={`text-xs font-medium ${
                returnPct >= 0 ? "text-[var(--success)]" : "text-red-400"
              }`}
            >
              我的组合 {returnPct >= 0 ? "+" : ""}{returnPct}%
            </span>
          )}
          {benchmarks.map((b) =>
            b.changePct !== null ? (
              <span
                key={b.key}
                className="flex items-center gap-1 text-xs font-medium text-[var(--muted)]"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: BENCHMARK_LINE_COLORS[b.key] ?? CHART_COLORS.benchmark }}
                />
                {b.label} {b.changePct >= 0 ? "+" : ""}{b.changePct}%
              </span>
            ) : null,
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
              width={mode === "equity" ? 58 : 42}
              domain={mode === "equity" ? [(min: number) => Math.floor(min * 0.995), (max: number) => Math.ceil(max * 1.005)] : ["auto", "auto"]}
              tickFormatter={(v: number) => mode === "equity" ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                background: CHART_COLORS.tooltipBg,
                border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                borderRadius: 14,
              }}
              formatter={(value: number | undefined, name?: string) => [
                mode === "equity"
                  ? `$${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : `${(value ?? 0).toFixed(2)}%`,
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
              dataKey={mode === "equity" ? "equity" : "portfolio"}
              name={mode === "equity" ? "权益" : "我的组合"}
              stroke={CHART_COLORS.primary}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, fill: CHART_COLORS.primary }}
            />
            {benchmarks.map((b) => (
              <Line
                key={b.key}
                type="monotone"
                dataKey={b.key}
                name={b.label}
                stroke={BENCHMARK_LINE_COLORS[b.key] ?? CHART_COLORS.benchmark}
                strokeWidth={1.6}
                dot={false}
                strokeDasharray="4 2"
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
