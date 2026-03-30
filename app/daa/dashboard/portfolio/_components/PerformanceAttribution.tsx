"use client";

import { useEffect, useState } from "react";
import {
  DaaSurfaceFilterChip,
  DaaSurfacePanel,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import { cn } from "@/lib/utils";
import type { PerformanceSummary } from "@/src/core/attribution";

interface AttributionReadModel {
  period: {
    type: "30d" | "90d" | "1y" | "ytd" | "all";
    startDate: string;
    endDate: string;
  };
  performance: PerformanceSummary;
  decisions: Array<unknown>;
  baseCurrency: string;
  loadedAt: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data: T;
}

type PeriodType = "30d" | "90d" | "1y" | "ytd";

function formatNumberCompact(val: number): string {
  if (Math.abs(val) < 0.01) return "0.00%";
  return `${val.toFixed(2)}%`;
}

function getContributionTone(
  contrib: number,
): "green" | "red" | "slate" {
  if (contrib > 0.01) return "green";
  if (contrib < -0.01) return "red";
  return "slate";
}

export function PerformanceAttribution() {
  const [period, setPeriod] = useState<PeriodType>("30d");
  const [readModel, setReadModel] = useState<AttributionReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/daa/read/attribution?period=${period}`);
        if (!res.ok) throw new Error("归因数据获取失败");
        const json = (await res.json()) as ApiResponse<AttributionReadModel>;
        if (!json.ok || !json.data) throw new Error("归因数据获取失败");
        setReadModel(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  if (loading) {
    return (
      <DaaSurfacePanel
        title="绩效归因"
        subtitle="资产级别贡献分析"
        accent="green"
      >
        <SkeletonChart height={320} />
      </DaaSurfacePanel>
    );
  }

  if (error || !readModel) {
    return (
      <DashboardErrorNotice
        title="归因数据加载失败"
        description={error || "无法获取绩效数据"}
      />
    );
  }

  const data = readModel.performance;
  const p = data.period;
  const hasData = data.assetAttributions && data.assetAttributions.length > 0;

  return (
    <DaaSurfacePanel
      title="绩效归因"
      subtitle="资产级别与资产类别的贡献分析"
      accent="green"
      action={
        <div className="flex gap-2">
          {(["30d", "90d", "1y", "ytd"] as PeriodType[]).map((p) => (
            <DaaSurfaceFilterChip
              key={p}
              active={period === p}
              onClick={() => setPeriod(p)}
            >
              {p === "30d" ? "30 天" : p === "90d" ? "90 天" : p === "1y" ? "1 年" : "年初至今"}
            </DaaSurfaceFilterChip>
          ))}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Summary Row */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)] mb-3">
            期间统计
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3.5")}>
              <div className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
                总收益率
              </div>
              <div className="mt-2 font-mono text-lg text-[var(--text)]">
                {formatNumberCompact(p.totalReturnPct * 100)}
              </div>
            </div>
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3.5")}>
              <div className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
                基准收益率
              </div>
              <div className="mt-2 font-mono text-lg text-[var(--text)]">
                {formatNumberCompact(p.benchmarkReturnPct * 100)}
              </div>
            </div>
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3.5")}>
              <div className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
                超额收益 (Alpha)
              </div>
              <div
                className={cn(
                  "mt-2 font-mono text-lg",
                  p.excessReturnPct > 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {formatNumberCompact(p.excessReturnPct * 100)}
              </div>
            </div>
          </div>
        </div>

        {/* Asset Contribution Table */}
        {hasData ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)] mb-3">
              资产贡献排序
            </div>
            <div className={cn(daaSurfaceSubtlePanelClassName, "overflow-hidden")}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left px-4 py-2.5 text-[var(--faint)] font-semibold">
                        标的
                      </th>
                      <th className="text-right px-4 py-2.5 text-[var(--faint)] font-semibold">
                        权重
                      </th>
                      <th className="text-right px-4 py-2.5 text-[var(--faint)] font-semibold">
                        收益率
                      </th>
                      <th className="text-right px-4 py-2.5 text-[var(--faint)] font-semibold">
                        贡献度
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assetAttributions
                      .sort(
                        (a, b) =>
                          Math.abs(b.contributionPct) -
                          Math.abs(a.contributionPct),
                      )
                      .map((attr, idx) => {
                        const isTopContributor =
                          data.topContributors.some(
                            (tc) => tc.symbol === attr.symbol,
                          );
                        const isTopDetractor =
                          data.topDetractors.some(
                            (td) => td.symbol === attr.symbol,
                          );
                        const bgColor = isTopContributor
                          ? "bg-[rgba(34,197,94,0.1)]"
                          : isTopDetractor
                            ? "bg-[rgba(239,68,68,0.1)]"
                            : "";

                        return (
                          <tr
                            key={attr.symbol}
                            className={cn(
                              "border-b border-[var(--border)]/50",
                              bgColor,
                            )}
                          >
                            <td className="px-4 py-2.5 text-[var(--text)] font-medium">
                              {attr.symbol}
                            </td>
                            <td className="text-right px-4 py-2.5 font-mono text-[var(--muted)]">
                              {formatPercent(attr.weight * 100)}
                            </td>
                            <td
                              className={cn(
                                "text-right px-4 py-2.5 font-mono",
                                attr.assetReturnPct >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400",
                              )}
                            >
                              {formatNumberCompact(
                                attr.assetReturnPct * 100,
                              )}
                            </td>
                            <td
                              className={cn(
                                "text-right px-4 py-2.5 font-mono font-semibold",
                                attr.contributionPct > 0
                                  ? "text-emerald-400"
                                  : "text-red-400",
                              )}
                            >
                              {formatNumberCompact(
                                attr.contributionPct * 100,
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-[var(--muted)] py-6 text-center">
            该期间暂无数据
          </div>
        )}

        {/* By Asset Class */}
        {data.byAssetClass && data.byAssetClass.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)] mb-3">
              按资产类别分解
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.byAssetClass.map((ac) => (
                <div
                  key={ac.assetClass}
                  className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3")}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text)]">
                      {ac.assetClass}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-mono font-semibold",
                        ac.contributionPct > 0
                          ? "text-emerald-400"
                          : "text-red-400",
                      )}
                    >
                      {formatNumberCompact(ac.contributionPct * 100)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    权重 {formatPercent(ac.weight * 100)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DaaSurfacePanel>
  );
}
