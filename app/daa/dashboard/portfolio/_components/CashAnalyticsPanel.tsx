"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DaaSurfacePanel,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { cn } from "@/lib/utils";
import type { CashAnalytics } from "@/src/core/cashManagement";

interface CashAnalyticsReadModel {
  basic: CashAnalytics;
  advanced: CashAnalytics & {
    volatilityAdjustment: number;
    liquidityBuffer: number;
    marginSafetyRatio: number;
  };
  marketRegime: string | null;
  portfolioExpectedReturn: number;
  baseCurrency: string;
  loadedAt: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data: T;
}

function getRecommendationTone(
  rec: "deploy" | "hold" | "withdraw",
): "green" | "amber" | "slate" {
  if (rec === "deploy") return "green";
  if (rec === "withdraw") return "amber";
  return "slate";
}

function getRecommendationLabel(
  rec: "deploy" | "hold" | "withdraw",
): string {
  if (rec === "deploy") return "部署闲置资金";
  if (rec === "withdraw") return "可减少现金";
  return "维持现状";
}

export function CashAnalyticsPanel() {
  const [analytics, setAnalytics] = useState<CashAnalytics | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/daa/read/cash-analytics");
        if (!res.ok) throw new Error("现金分析获取失败");
        const json = (await res.json()) as ApiResponse<CashAnalyticsReadModel>;
        if (!json.ok || !json.data) throw new Error("现金分析获取失败");

        const readModel = json.data;
        const basicAnalytics = readModel.basic;

        // Check if empty: totalCash=0 AND cashPct=0
        if (basicAnalytics.totalCash === 0 && basicAnalytics.cashPct === 0) {
          setIsEmpty(true);
          return;
        }

        setAnalytics(basicAnalytics);
        setBaseCurrency(readModel.baseCurrency);
      } catch (err) {
        setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (error) {
    return (
      <DashboardErrorNotice
        title="现金分析加载失败"
        description={error}
      />
    );
  }

  if (loading) {
    // Compact loading state
    return (
      <div className={cn(daaSurfaceSubtlePanelClassName, "px-5 py-4")}>
        <div className="h-16 animate-pulse bg-[var(--border)] rounded" />
      </div>
    );
  }

  if (!analytics || isEmpty) {
    return (
      <DashboardErrorNotice
        title="现金分析"
        description="暂无现金数据，请先入金"
      />
    );
  }

  const a = analytics;
  const recTone = getRecommendationTone(a.recommendation);
  const recLabel = getRecommendationLabel(a.recommendation);
  const targetCashAmount = a.totalCash / Math.max(a.cashPct || 0.01) * a.targetCashPct;

  return (
    <div className={cn(daaSurfaceSubtlePanelClassName, "px-5 py-4")}>
      <div className="space-y-4">
        {/* Header row: Cash % with target + recommendation */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">
              现金头寸
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <div className="font-mono text-lg text-[var(--text)]">
                {formatPercent(a.cashPct * 100, 1)}
              </div>
              <div className="text-xs text-[var(--muted)]">
                目标 {formatPercent(a.targetCashPct * 100, 1)}
              </div>
            </div>
          </div>

          {/* Recommendation badge + action link */}
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
                recTone === "green"
                  ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-400"
                  : recTone === "amber"
                    ? "border-amber-400/30 bg-amber-500/12 text-amber-300"
                    : "border-[var(--muted-border)] bg-[var(--muted-bg)] text-[var(--muted)]",
              )}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    recTone === "green"
                      ? "currentColor"
                      : recTone === "amber"
                        ? "currentColor"
                        : "var(--muted)",
                }}
              />
              {recLabel}
            </div>

            {a.recommendation === "deploy" && a.deployableAmount > 0 && (
              <Link
                href="/daa/dashboard/rebalance"
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                去调仓 →
              </Link>
            )}
          </div>
        </div>

        {/* Compact metrics inline */}
        <div className="flex flex-wrap gap-4 text-xs border-t border-[var(--border)]/50 pt-3">
          <div>
            <div className="text-[var(--faint)]">实际现金</div>
            <div className="mt-1 font-mono text-sm text-[var(--text)]">
              {formatCurrency(a.totalCash, baseCurrency)}
            </div>
          </div>
          <div>
            <div className="text-[var(--faint)]">现金拖累</div>
            <div className="mt-1 font-mono text-sm text-[var(--muted)]">
              {formatPercent(a.cashDragPct * 100, 2)} / 年
            </div>
          </div>
          <div>
            <div className="text-[var(--faint)]">可部署金额</div>
            <div className="mt-1 font-mono text-sm text-[var(--text)]">
              {formatCurrency(a.deployableAmount, baseCurrency)}
            </div>
          </div>
        </div>

        {/* Recommendation reason */}
        <div className="text-xs leading-5 text-[var(--muted)] border-t border-[var(--border)]/50 pt-3">
          💡 {a.recommendationReason}
        </div>
      </div>
    </div>
  );
}
