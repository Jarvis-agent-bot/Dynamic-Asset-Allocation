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

import { WorkbenchEmptyState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";
import { daaChartTooltipContentStyle, daaChartTooltipItemStyle, daaChartTooltipLabelStyle } from "@/app/daa/dashboard/_shared/chartTooltipStyles";

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

type ServerChartData = {
  mode: "equity" | "twr";
  days: number;
  series: Array<Record<string, unknown>>;
  changePct: number | null;
  lastEquity?: number;
  benchmarks?: Array<{ key: string; label: string; changePct: number | null }>;
};

type SeriesCoverage = {
  count: number;
  startDate: string;
  endDate: string;
  maxGapDays: number;
};

const CHART_COLORS = {
  muted: "var(--muted)",
  grid: "var(--border)",
  primary: "var(--primary)",
  benchmark: "var(--success)",
  benchmark2: "var(--indigo)",
} as const;

/** 基准 series key → 线条颜色（与后端 BENCHMARK_DEFS 的 key 对应） */
const BENCHMARK_LINE_COLORS: Record<string, string> = {
  benchmarkSpy: CHART_COLORS.benchmark,
  benchmarkQqq: CHART_COLORS.benchmark2,
};

function benchmarkLegendDotClass(benchmarkKey: string): string {
  if (benchmarkKey === "benchmarkQqq") return "bg-[var(--indigo)]";
  return "bg-[var(--success)]";
}

function daysBetween(leftDate: string, rightDate: string): number {
  const left = Date.parse(`${leftDate}T00:00:00.000Z`);
  const right = Date.parse(`${rightDate}T00:00:00.000Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return Math.max(0, Math.round((right - left) / 86_400_000));
}

function summarizeCoverage(data: Array<Record<string, unknown>>): SeriesCoverage | null {
  const dates = data
    .map((point) => String(point.date || ""))
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return null;

  let maxGapDays = 0;
  for (let index = 1; index < dates.length; index += 1) {
    maxGapDays = Math.max(maxGapDays, daysBetween(dates[index - 1], dates[index]));
  }

  return {
    count: dates.length,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    maxGapDays,
  };
}

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
    (leftSnapshot, rightSnapshot) => Date.parse(leftSnapshot.ts) - Date.parse(rightSnapshot.ts),
  );
  const cutoff =
    days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const filtered = cutoff ? sorted.filter((snapshot) => snapshot.ts >= cutoff) : sorted;
  if (filtered.length === 0) return [];

  // 创建基准数据的日期索引
  const benchmarkMap = new Map<string, number>();
  if (benchmarkData && benchmarkData.length > 0) {
    const sortedBench = [...benchmarkData].sort(
      (leftBenchmarkPoint, rightBenchmarkPoint) => Date.parse(leftBenchmarkPoint.ts) - Date.parse(rightBenchmarkPoint.ts),
    );
    const benchFiltered = cutoff ? sortedBench.filter((benchmarkPoint) => benchmarkPoint.ts >= cutoff) : sortedBench;
    if (benchFiltered.length > 0) {
      const benchBase = benchFiltered[0].price > 0 ? benchFiltered[0].price : 1;
      for (const benchmarkPoint of benchFiltered) {
        const dateKey = benchmarkPoint.ts.slice(0, 10);
        benchmarkMap.set(dateKey, +((benchmarkPoint.price / benchBase) * 100).toFixed(2));
      }
    }
  }

  // 跳过 equity=0 的无效快照（如 ledger_reset 初始状态）
  const meaningful = filtered.filter((snapshot) => snapshot.totalEquity > 0);
  if (meaningful.length === 0) return [];

  // 构建按时间排序的现金流 map（按日期聚合净现金流）
  const cfMap = new Map<string, number>();
  if (cashFlowEvents && cashFlowEvents.length > 0) {
    for (const cashFlowEvent of cashFlowEvents) {
      const dateKey = cashFlowEvent.ts.slice(0, 10);
      const prev = cfMap.get(dateKey) ?? 0;
      const signed = cashFlowEvent.side === "deposit" ? cashFlowEvent.amount : -cashFlowEvent.amount;
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

  return meaningful.map((snapshot, snapshotIndex) => {
    const dateKey = snapshot.ts.slice(0, 10);

    if (snapshotIndex === 0) {
      const point: NormalizedPoint = {
        label: snapshot.ts.slice(5, 10),
        date: dateKey,
        portfolio: 100,
      };
      const benchVal = benchmarkMap.get(dateKey);
      if (benchVal != null) point.benchmark = benchVal;
      prevEquity = snapshot.totalEquity;
      return point;
    }

    // 仅对该日期首次出现时扣除现金流，避免同一天多条快照重复扣除
    let netCashFlow = 0;
    if (!consumedDates.has(dateKey) && cfMap.has(dateKey)) {
      netCashFlow = cfMap.get(dateKey)!;
      consumedDates.add(dateKey);
    }

    // 子区间收益率：(当前 equity - 本期净现金流) / 上期 equity
    const adjEquity = snapshot.totalEquity - netCashFlow;
    const subReturn = prevEquity > 0 && adjEquity > 0 ? adjEquity / prevEquity : 1;
    cumFactor *= subReturn;
    prevEquity = snapshot.totalEquity;

    const point: NormalizedPoint = {
      label: snapshot.ts.slice(5, 10),
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
  const sorted = [...snapshots].sort((leftSnapshot, rightSnapshot) => Date.parse(leftSnapshot.ts) - Date.parse(rightSnapshot.ts));
  const cutoff = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const filtered = cutoff ? sorted.filter((snapshot) => snapshot.ts >= cutoff) : sorted;
  return filtered
    .filter((snapshot) => snapshot.totalEquity > 0)
    .map((snapshot) => ({
      label: snapshot.ts.slice(5, 10),
      date: snapshot.ts.slice(0, 10),
      equity: +snapshot.totalEquity.toFixed(2),
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
  const [serverData, setServerData] = useState<ServerChartData | null>(null);

  const selectedDays = useMemo(
    () => TIME_RANGES.find((timeRange) => timeRange.key === range)?.days ?? 0,
    [range],
  );

  // 从后端获取预计算的曲线数据
  React.useEffect(() => {
    const params = new URLSearchParams({ mode, days: String(selectedDays) });
    const controller = new AbortController();
    setServerData(null);
    fetch(`/api/daa/read/performance-chart?${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((jsonPayload) => {
        const chartPayload = jsonPayload?.data ?? jsonPayload;
        if (!chartPayload?.series || controller.signal.aborted) return;
        setServerData({
          mode,
          days: selectedDays,
          series: chartPayload.series,
          changePct: chartPayload.changePct ?? null,
          lastEquity: chartPayload.lastEquity,
          benchmarks: chartPayload.benchmarks ?? [],
        });
      })
      .catch(() => {});

    return () => controller.abort();
  }, [mode, selectedDays]);

  const currentServerData = serverData?.mode === mode && serverData.days === selectedDays ? serverData : null;

  // 优先用后端数据；后端未就绪时 fallback 到本地计算
  const data = useMemo(() => {
    if (currentServerData?.series) return currentServerData.series;
    if (mode === "equity") return buildEquityCurve(snapshots, selectedDays);
    return normalizeSnapshots(snapshots, selectedDays, undefined, props.cashFlowEvents);
  }, [currentServerData, mode, snapshots, selectedDays, props.cashFlowEvents]);

  // 收益率模式下后端返回的对比基准（标普500 / 纳斯达克100）
  const benchmarks = useMemo(
    () => (mode === "twr" ? currentServerData?.benchmarks ?? [] : []),
    [mode, currentServerData],
  );
  const returnPct = useMemo(() => currentServerData?.changePct ?? null, [currentServerData]);
  const coverage = useMemo(() => summarizeCoverage(data), [data]);

  const equityChange = useMemo(() => {
    if (mode !== "equity") return null;
    if (currentServerData?.lastEquity != null && currentServerData.changePct != null) {
      return { last: currentServerData.lastEquity, change: 0, pct: currentServerData.changePct };
    }
    return null;
  }, [mode, currentServerData]);

  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      {/* 时间范围选择器 + 收益率 */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* 金额 / 收益率 模式切换 — 收益率模式下叠加标普500/纳斯达克100 对比 */}
          <div className="flex gap-1 rounded-md bg-[var(--surface)] p-0.5">
            {([
              { key: "equity", label: "金额" },
              { key: "twr", label: "收益率" },
            ] as const).map((chartMode) => (
              <button
                key={chartMode.key}
                type="button"
                onClick={() => setMode(chartMode.key)}
                className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === chartMode.key
                    ? "bg-[var(--primary-bg)] text-[var(--primary)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {chartMode.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
          {TIME_RANGES.map((timeRange) => (
            <button
              key={timeRange.key}
              type="button"
              onClick={() => setRange(timeRange.key)}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors ${
                range === timeRange.key
                  ? "bg-[var(--primary-bg)] text-[var(--primary)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {timeRange.label}
            </button>
          ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {mode === "equity" && equityChange ? (
            <span className={`text-xs font-medium ${equityChange.change >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
              ${equityChange.last.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({equityChange.pct >= 0 ? "+" : ""}{equityChange.pct.toFixed(2)}%)
            </span>
          ) : null}
          {mode === "twr" && returnPct !== null && (
            <span
              className={`text-xs font-medium ${
                returnPct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
              }`}
            >
              我的组合 {returnPct >= 0 ? "+" : ""}{returnPct}%
            </span>
          )}
          {benchmarks.map((benchmark) =>
            benchmark.changePct !== null ? (
              <span
                key={benchmark.key}
                className="flex items-center gap-1 text-xs font-medium text-[var(--muted)]"
              >
                <span
                  className={`inline-block h-2 w-2 rounded-[var(--radius-sm)] ${benchmarkLegendDotClass(benchmark.key)}`}
                />
                {benchmark.label} {benchmark.changePct >= 0 ? "+" : ""}{benchmark.changePct}%
              </span>
            ) : null,
          )}
        </div>
      </div>

      {coverage ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
          <span>记录 {coverage.count} 条</span>
          <span>{coverage.startDate} 至 {coverage.endDate}</span>
          {coverage.maxGapDays > 3 ? (
            <span className="rounded-[var(--radius-sm)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-2 py-0.5 text-[var(--amber)]">
              最大断档 {coverage.maxGapDays} 天
            </span>
          ) : null}
        </div>
      ) : null}

      {/* 图表 */}
      {data.length < 2 ? (
        <WorkbenchEmptyState
          title={snapshots.length < 2 ? "暂无权益曲线" : "当前区间记录不足"}
          description={snapshots.length < 2 ? "完成首次入金或交易后，这里会显示组合权益路径。" : "这个时间范围内少于 2 条有效权益快照，请切换更长区间或检查定时价格刷新。"}
          className="border-0 bg-transparent px-0 py-4"
        />
      ) : (
      <div className="h-[240px] min-h-[240px] w-full min-w-0">
        <ResponsiveContainer width="100%" height={240} minWidth={1} minHeight={240}>
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
              contentStyle={daaChartTooltipContentStyle}
              itemStyle={daaChartTooltipItemStyle}
              labelStyle={daaChartTooltipLabelStyle}
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
            {benchmarks.map((benchmark) => (
              <Line
                key={benchmark.key}
                type="monotone"
                dataKey={benchmark.key}
                name={benchmark.label}
                stroke={BENCHMARK_LINE_COLORS[benchmark.key] ?? CHART_COLORS.benchmark}
                strokeWidth={1.6}
                dot={false}
                strokeDasharray="4 2"
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
});
