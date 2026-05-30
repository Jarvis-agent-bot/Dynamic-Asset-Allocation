"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { marketRegimeTone } from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";
import {
  isActionableMarketScope,
  marketIndicatorSignalLabelZh,
  marketScopePrimaryLabelZh,
} from "@/src/daa/modules/marketContext/marketContextLabels";
import { MARKET_SCOPE_LABEL_ZH_, type DaaMarketIndicatorMeaning } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import type { DaaMarketIndicatorSnapshot } from "@/src/daa/modules/marketContext/marketContextTypes";

import { IndicatorChart } from "./IndicatorChart";
import { PercentileDistribution } from "./PercentileDistribution";

type IndicatorSeriesData = {
  key: string;
  label: string;
  category: string;
  scope: string;
  unit: string;
  meaning?: DaaMarketIndicatorMeaning;
  symbols: string[];
  isRatio: boolean;
  isVolatility: boolean;
  series: Array<{ date: string; value: number }>;
  currentValue: number | null;
  distribution: {
    bins: Array<{ min: number; max: number; count: number }>;
    currentBin: number;
    currentValue: number | null;
    percentile: number;
  };
  componentSeries?: {
    left: { symbol: string; series: Array<{ date: string; value: number }> };
    right: { symbol: string; series: Array<{ date: string; value: number }> };
  };
};

function categoryLabelZh(category: string): string {
  if (category === "volatility") return "波动压力";
  if (category === "relative_value") return "相对强弱";
  if (category === "macro") return "宏观代理";
  if (category === "sentiment") return "情绪";
  return category;
}

function scopeLabelZh(scope: string): string {
  return MARKET_SCOPE_LABEL_ZH_[scope as keyof typeof MARKET_SCOPE_LABEL_ZH_] || scope;
}

export default function IndicatorDetailClient(props: { indicatorKey: string }) {
  const router = useRouter();
  const [data, setData] = useState<IndicatorSeriesData | null>(null);
  const [snapshot, setSnapshot] = useState<DaaMarketIndicatorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    // 并行加载：指标序列 + 轻量级 bootstrap（只取 marketContext）
    Promise.all([
      fetch(`/api/daa/market/indicator-series?key=${encodeURIComponent(props.indicatorKey)}`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((j) => j.data ?? j),
      fetch("/api/daa/read/workbench?syncPrices=0")
        .then((r) => r.ok ? r.json() : null)
        .then((j) => {
          const indicators = j?.data?.bootstrap?.marketContext?.indicators ?? [];
          return indicators.find((i: DaaMarketIndicatorSnapshot) => i.key === props.indicatorKey) ?? null;
        })
        .catch(() => null),
    ])
      .then(([seriesData, snap]) => {
        setData(seriesData);
        setSnapshot(snap);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [props.indicatorKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
        <span className="text-sm text-[var(--muted)]">加载指标数据…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 py-12 text-center">
        <div className="text-sm text-[var(--muted)]">{error || "未找到指标数据"}</div>
        <button type="button" onClick={() => router.push("/daa/dashboard/rebalance")}
          className="rounded-[10px] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--elevated)]">
          返回调仓
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 顶部信息栏 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2">
        <button type="button" onClick={() => router.push("/daa/dashboard/rebalance")}
          className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--text)]">
          <ArrowLeft className="h-4 w-4" />调仓
        </button>
        <span className="text-lg font-bold text-[var(--text)]">{data.label}</span>
        {/* 优先用 snapshot.rawValue 保持与"指标概览"一致；series.currentValue 是
            时间序列最后一点，与 snapshot 不同步时会让两个视图显示不同数字。 */}
        {(() => {
          const displayValue = snapshot?.rawValue ?? data.currentValue;
          if (displayValue == null) return null;
          return (
            <span className="font-[var(--font-mono)] text-xl font-bold text-[var(--text)]">
              {displayValue.toFixed(data.unit === "x" ? 4 : 2)}{data.unit === "%" ? "%" : data.unit === "x" ? "" : ` ${data.unit}`}
            </span>
          );
        })()}
        {snapshot ? (
          <>
            <span className="text-xs text-[var(--faint)]">百分位 {snapshot.percentile252?.toFixed(0) ?? "—"}%</span>
            <DaaSurfaceStatusPill tone={marketRegimeTone(snapshot.stance)}>
              {isActionableMarketScope(snapshot.scope)
                ? marketIndicatorSignalLabelZh(snapshot)
                : marketScopePrimaryLabelZh(snapshot)}
            </DaaSurfaceStatusPill>
          </>
        ) : null}
      </div>

      {/* 两栏主体 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 左侧：走势图 */}
        <SectionErrorBoundary sectionName="走势图">
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4">
            <IndicatorChart series={data.series} label={data.label} unit={data.unit} />
          </div>
        </SectionErrorBoundary>

        {/* 右侧：指标档案 + 百分位分布 */}
        <div className="space-y-4">
          {/* 指标档案 */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">指标档案</div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[var(--faint)]">当前值</div>
                <div className="font-[var(--font-mono)] text-[var(--text)]">
                  {data.currentValue?.toFixed(data.unit === "x" ? 4 : 2) ?? "—"} {data.unit}
                </div>
              </div>
              {snapshot?.percentile252 != null ? (
                <div>
                  <div className="text-[var(--faint)]">252 天百分位</div>
                  <div className="font-[var(--font-mono)] text-[var(--text)]">{snapshot.percentile252.toFixed(1)}%</div>
                </div>
              ) : null}
              {snapshot?.zscore60 != null ? (
                <div>
                  <div className="text-[var(--faint)]">60 天 Z-score</div>
                  <div className="font-[var(--font-mono)] text-[var(--text)]">{snapshot.zscore60.toFixed(2)}</div>
                </div>
              ) : null}
              {snapshot?.trend7dPct != null ? (
                <div>
                  <div className="text-[var(--faint)]">7 天趋势</div>
                  <div className={cn("font-[var(--font-mono)]", snapshot.trend7dPct >= 0 ? "text-[var(--success)]" : "text-red-400")}>
                    {snapshot.trend7dPct >= 0 ? "+" : ""}{snapshot.trend7dPct.toFixed(2)}%
                  </div>
                </div>
              ) : null}
              {snapshot?.trend30dPct != null ? (
                <div>
                  <div className="text-[var(--faint)]">30 天趋势</div>
                  <div className={cn("font-[var(--font-mono)]", snapshot.trend30dPct >= 0 ? "text-[var(--success)]" : "text-red-400")}>
                    {snapshot.trend30dPct >= 0 ? "+" : ""}{snapshot.trend30dPct.toFixed(2)}%
                  </div>
                </div>
              ) : null}
            </div>

            {snapshot ? (
              <div className="space-y-1.5 border-t border-[var(--border)] pt-3 text-xs">
                <div className="flex justify-between text-[var(--faint)]">
                  <span>影响区域</span>
                  <span className="text-[var(--muted)]">{scopeLabelZh(snapshot.scope)}</span>
                </div>
                <div className="flex justify-between text-[var(--faint)]">
                  <span>类别</span>
                  <span className="text-[var(--muted)]">{categoryLabelZh(snapshot.category)}</span>
                </div>
                <div className="text-[var(--muted)] leading-5">{snapshot.reason}</div>
              </div>
            ) : null}

            {data.meaning ? (
              <div className="space-y-2 border-t border-[var(--border)] pt-3 text-xs leading-5">
                <div>
                  <div className="text-[var(--faint)]">测量对象</div>
                  <div className="text-[var(--muted)]">{data.meaning.measurement}</div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">高分位代表</div>
                  <div className="text-[var(--muted)]">{data.meaning.highSignal}</div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">低分位代表</div>
                  <div className="text-[var(--muted)]">{data.meaning.lowSignal}</div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">中性区间</div>
                  <div className="text-[var(--muted)]">{data.meaning.neutralSignal}</div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">使用口径</div>
                  <div className="text-[var(--muted)]">{data.meaning.usage}</div>
                </div>
              </div>
            ) : null}

            {/* 组成符号 */}
            <div className="border-t border-[var(--border)] pt-3">
              <div className="text-[10px] text-[var(--faint)] mb-1">{data.isRatio ? "组成符号" : "数据来源"}</div>
              <div className="flex flex-wrap gap-2">
                {data.symbols.map((s) => (
                  <span key={s} className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] px-2 py-0.5 font-[var(--font-mono)] text-xs text-[var(--muted)]">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* 百分位分布 */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4">
            <PercentileDistribution
              bins={data.distribution.bins}
              currentBin={data.distribution.currentBin}
              currentValue={data.distribution.currentValue}
              percentile={data.distribution.percentile}
              unit={data.unit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
