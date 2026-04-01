"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowRight, Plus, Wallet, Target } from "lucide-react";

import { useTodayDecision } from "@/app/daa/dashboard/_hooks/useTodayDecision";
import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";

import { WorkbenchNotificationBar } from "@/app/daa/dashboard/workbench/_components/WorkbenchNotificationBar";

import { TodayBrief } from "./TodayBrief";

// ─────────────────────────────────────────────────────────────────────────────
// 空组合引导流
// ─────────────────────────────────────────────────────────────────────────────

function EmptyPortfolioGuide(props: { hasAssets: boolean; hasCash: boolean; hasTargets: boolean }) {
  const steps = [
    {
      done: props.hasCash,
      icon: Wallet,
      title: "入金",
      desc: "记录初始资金，作为组合起点",
      href: "/daa/dashboard/portfolio",
    },
    {
      done: props.hasAssets,
      icon: Plus,
      title: "添加标的",
      desc: "将关注的股票、ETF、债券加入观察列表",
      href: "/daa/dashboard/portfolio?tab=watchlist",
    },
    {
      done: props.hasTargets,
      icon: Target,
      title: "设置目标权重",
      desc: "为每个标的分配目标占比，系统自动检测偏移",
      href: "/daa/dashboard/portfolio?tab=watchlist",
    },
  ];

  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-6">
      <div className="mb-4 text-center">
        <div className="text-lg font-semibold text-[var(--text)]">开始构建你的组合</div>
        <div className="mt-1 text-sm text-[var(--muted)]">完成以下步骤，即可使用调仓和分析功能</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <Link
              key={i}
              href={step.href}
              className={`rounded-[14px] border px-4 py-4 transition-colors ${
                step.done
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-[var(--border)] hover:border-[var(--primary)]/30 hover:bg-[rgba(8,12,20,0.6)]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  step.done ? "bg-emerald-500/20 text-emerald-400" : "bg-[rgba(255,255,255,0.06)] text-[var(--muted)]"
                }`}>
                  {step.done ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className={`text-sm font-medium ${step.done ? "text-emerald-400" : "text-[var(--text)]"}`}>
                    {step.title}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">{step.desc}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 首页
// ─────────────────────────────────────────────────────────────────────────────

export default function TodayPageClient(props: {
  initialTab?: string;
  initialSection?: string;
}) {
  const today = useTodayDecision();
  const wbModel = useWorkbenchPageModel({ initialTab: props.initialTab });

  const baseCurrency = wbModel.bootstrap?.baseCurrency || "USD";
  const topHoldings = useMemo(() => {
    return (wbModel.allocationSummary?.topHoldings || []).slice(0, 5);
  }, [wbModel.allocationSummary]);

  const isEmptyPortfolio = wbModel.totalEquity === 0 && topHoldings.length === 0;
  const hasCash = wbModel.availableCashValue > 0;
  const hasAssets = wbModel.summary.holdingAssets > 0 || wbModel.summary.watchlistAssets > 0;
  const hasTargets = wbModel.tableProps.rows.some((r) => r.targetWeightHint > 0);

  // 漂移数量（供入口卡片显示）
  const driftCount = useMemo(() => {
    const threshold = (wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct ?? 0.05) * 100;
    return wbModel.tableProps.rows.filter(
      (r) => r.watchEnabled && r.targetWeightHint > 0 && r.gapPct != null && Math.abs(r.gapPct) > threshold,
    ).length;
  }, [wbModel.tableProps.rows, wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct]);

  return (
    <div className="space-y-4">
      {/* ═══ 通知区 ═══ */}
      <WorkbenchNotificationBar
        error={wbModel.error}
        authRequired={wbModel.authRequired}
        bootstrap={wbModel.bootstrap}
        executionReceipt={wbModel.executionReceipt}
        onClearExecutionReceipt={wbModel.clearExecutionReceipt}
        currentCycle={wbModel.rebalanceSectionProps?.currentCycle ?? null}
        warnings={wbModel.bootstrap?.warnings || []}
      />

      {/* ═══ 空组合引导 or 组合卡片 ═══ */}
      {wbModel.bootstrap ? (
        isEmptyPortfolio ? (
          <EmptyPortfolioGuide hasCash={hasCash} hasAssets={hasAssets} hasTargets={hasTargets} />
        ) : (
          <Link
            href="/daa/dashboard/portfolio"
            className="block rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-4 transition-colors hover:border-[var(--primary)]/20"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-[var(--font-mono)] text-2xl tabular-nums text-[var(--text)]">
                  {formatCurrency(wbModel.totalEquity, baseCurrency)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  {wbModel.equityDelta?.dayChangePct != null && (
                    <span className={(wbModel.equityDelta.dayChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {(wbModel.equityDelta.dayChange ?? 0) >= 0 ? <ArrowUp className="mr-0.5 inline h-3 w-3" /> : <ArrowDown className="mr-0.5 inline h-3 w-3" />}
                      今日 {formatPercent(Math.abs(wbModel.equityDelta.dayChangePct))}
                    </span>
                  )}
                  {wbModel.equityDelta?.weekChangePct != null && (
                    <span className={(wbModel.equityDelta.weekChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {(wbModel.equityDelta.weekChange ?? 0) >= 0 ? <ArrowUp className="mr-0.5 inline h-3 w-3" /> : <ArrowDown className="mr-0.5 inline h-3 w-3" />}
                      本周 {formatPercent(Math.abs(wbModel.equityDelta.weekChangePct))}
                    </span>
                  )}
                  <span className="text-[var(--muted)]">
                    持仓 {formatCurrency(wbModel.holdingsValue, baseCurrency)} · 现金 {formatCurrency(wbModel.availableCashValue, baseCurrency)}
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[var(--muted)]" />
            </div>

            {/* mini 持仓列表 */}
            {topHoldings.length > 0 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {topHoldings.map((h) => (
                  <div key={h.symbol} className="text-center">
                    <div className="text-xs font-medium text-[var(--text)]">{h.symbol}</div>
                    <div className="text-[10px] text-[var(--muted)]">{formatPercent(h.weightPct, 0)}</div>
                  </div>
                ))}
              </div>
            )}
          </Link>
        )
      ) : null}

      {/* ═══ AI 决策简报（仅有持仓时显示） ═══ */}
      {!isEmptyPortfolio && (
        <TodayBrief
          model={today.model}
          loading={today.loading}
          refreshing={today.refreshing}
          error={today.error}
          onRefresh={today.handleRefresh}
          onDecision={today.handleDecision}
        />
      )}

      {/* ═══ 快捷入口 ═══ */}
      {wbModel.bootstrap ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={isEmptyPortfolio ? "/daa/dashboard/portfolio" : "/daa/dashboard/rebalance"}
            className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-4 transition-colors hover:border-[var(--primary)]/30 hover:bg-[rgba(8,12,20,0.6)]"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--text)]">
                {isEmptyPortfolio ? "管理持仓" : "调仓工作流"}
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--muted)]" />
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {isEmptyPortfolio
                ? "添加标的、设置权重、管理观察列表"
                : wbModel.rebalanceSectionProps?.currentCycle
                  ? `周期 ${wbModel.rebalanceSectionProps.currentCycle.cycleId.slice(0, 8)} 进行中`
                  : driftCount > 0
                    ? `${driftCount} 项偏移超阈值`
                    : "配置均衡，暂无需调仓"}
            </div>
          </Link>
          <Link
            href="/daa/dashboard/trades"
            className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-4 transition-colors hover:border-[var(--primary)]/30 hover:bg-[rgba(8,12,20,0.6)]"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--text)]">交易记录</div>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--muted)]" />
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">周期、订单与现金流水</div>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
