"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Clock, Database } from "lucide-react";

import type { ExecutionReceipt } from "@/app/daa/dashboard/_hooks/dashboard/dashboardPageTypes";
import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceNoticeBox,
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
  type DaaSurfaceTone,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";
import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

// ─── Execution receipt meta ───
function executionReceiptMeta(status: ExecutionReceipt["status"]): {
  title: string;
  tone: DaaSurfaceTone;
} {
  if (status === "success") return { title: "执行成功", tone: "green" };
  if (status === "submitted") return { title: "订单已提交", tone: "indigo" };
  if (status === "partial") return { title: "部分执行成功", tone: "amber" };
  if (status === "blocked") return { title: "执行被风控阻断", tone: "red" };
  return { title: "执行失败", tone: "red" };
}

// ─── Types ───
export function DashboardNotificationBar(props: {
  // 原 BannerStack props
  error: string;
  authRequired: boolean;
  bootstrap: WorkbenchBootstrap | null;
  executionReceipt: ExecutionReceipt | null;
  onClearExecutionReceipt: () => void;
  // 业务告警 props（漂移已在 Stepper 展示）
  currentCycle: { status: string; cycleId: string } | null;
  warnings: string[];
}) {
  const actionLinkClassName = "inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--text)]";

  // ─── 业务级告警 pills（漂移已在 Stepper 展示，这里不再重复）───
  const alerts = useMemo(() => {
    const result: Array<{ key: string; tone: "amber" | "cyan"; icon: React.ReactNode; label: string }> = [];

    // 待审阅周期
    const cycleStatus = props.currentCycle?.status;
    if (cycleStatus === "generated" || cycleStatus === "reviewing") {
      result.push({
        key: "cycle",
        tone: "cyan",
        icon: <Clock className="h-3 w-3" />,
        label: cycleStatus === "generated" ? "有新提案待审阅" : "审阅进行中",
      });
    }

    // 数据健康
    const mdh = props.bootstrap?.marketDataHealth;
    if (mdh && mdh.status !== "ok") {
      result.push({
        key: "data",
        tone: "amber",
        icon: <Database className="h-3 w-3" />,
        label: mdh.status === "down" ? "市场数据不可用" : "市场数据已降级",
      });
    }

    // bootstrap 警告
    for (const w of props.warnings) {
      result.push({
        key: `warn-${w.slice(0, 20)}`,
        tone: "amber",
        icon: <AlertTriangle className="h-3 w-3" />,
        label: w,
      });
    }

    return result;
  }, [props.currentCycle, props.bootstrap?.marketDataHealth, props.warnings]);

  return (
    <div className="space-y-2">
      {/* ─── 系统级 Banner（认证失败、严重数据故障）─── */}
      {props.error ? (
        <DaaSurfaceNoticeBox
          tone="red"
          title="页面加载失败"
          icon={<AlertCircle className="h-4 w-4" />}
          description={props.authRequired ? "当前会话未登录或已失效，请重新登录后再试一次。" : props.error}
          action={props.authRequired ? (
            <Link href="/daa/login?returnTo=%2Fdaa%2Fdashboard" className="text-xs font-medium text-[var(--primary)] underline underline-offset-4">
              前往登录
            </Link>
          ) : null}
        />
      ) : null}

      {/* 市场数据严重故障（down 状态单独 banner，降级状态已在 pills 展示） */}
      {props.bootstrap?.marketDataHealth?.status === "down" ? (
        <DaaSurfaceNoticeBox
          tone="red"
          title="市场数据不可用"
          icon={<AlertCircle className="h-4 w-4" />}
          description={props.bootstrap.marketDataHealth.message}
        >
          <div className="font-[var(--font-mono)] text-xs text-[var(--muted)]">
            新鲜 {props.bootstrap.marketDataHealth.freshCount} · 过期 {props.bootstrap.marketDataHealth.staleCount} · 缺失 {props.bootstrap.marketDataHealth.missingCount} · 近 24h 失败率 {props.bootstrap.marketDataHealth.recentJobFailureRatePct.toFixed(1)}%
          </div>
        </DaaSurfaceNoticeBox>
      ) : null}

      {/* ─── 执行回执 Banner ─── */}
      {props.executionReceipt ? (() => {
        const meta = executionReceiptMeta(props.executionReceipt.status);
        return (
          <DaaSurfaceNoticeBox
            tone={meta.tone}
            title={meta.title}
            description={`周期 ${props.executionReceipt.cycleId.slice(0, 8)} · 模式 ${props.executionReceipt.mode === "all" ? "执行全部" : "执行选中"} · ${formatDateTime(props.executionReceipt.ts)}`}
          >
            <div className="text-sm text-[var(--text)]">{props.executionReceipt.summary}</div>
            <div className="font-[var(--font-mono)] text-xs text-[var(--muted)]">
              成交 {props.executionReceipt.executed} 笔
              {props.executionReceipt.submitted ? ` · 已提交 ${props.executionReceipt.submitted} 笔` : ""}
              · 失败 {props.executionReceipt.failed} 笔
            </div>
            {props.executionReceipt.reason ? (
              <div className="rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--faint)]">
                详情：{props.executionReceipt.reason}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/daa/dashboard/trades" className={actionLinkClassName}>查看交易记录</Link>
              <DaaSurfaceActionButton tone="slate" onClick={props.onClearExecutionReceipt}>关闭回执</DaaSurfaceActionButton>
            </div>
          </DaaSurfaceNoticeBox>
        );
      })() : null}

      {/* ─── 业务告警 Pills（无告警时不渲染，节省空间）─── */}
      {props.bootstrap && alerts.length > 0 ? (
        <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3 sm:px-5")}>
          <div className="flex items-center gap-2 overflow-x-auto">
            {alerts.map((alert) => (
              <DaaSurfaceStatusPill key={alert.key} tone={alert.tone} className="shrink-0">
                {alert.icon}
                <span className="ml-1">{alert.label}</span>
              </DaaSurfaceStatusPill>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
