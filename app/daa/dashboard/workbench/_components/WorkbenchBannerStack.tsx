"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

import type { ExecutionReceipt } from "@/app/daa/dashboard/_hooks/workbench/workbenchPageTypes";
import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DeepLedgerActionButton,
  DeepLedgerNoticeBox,
  type DeepLedgerTone,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

function executionReceiptMeta(status: ExecutionReceipt["status"]): {
  title: string;
  tone: DeepLedgerTone;
} {
  if (status === "success") return { title: "执行成功", tone: "green" };
  if (status === "submitted") return { title: "订单已提交", tone: "indigo" };
  if (status === "partial") return { title: "部分执行成功", tone: "amber" };
  if (status === "blocked") return { title: "执行被风控阻断", tone: "red" };
  return { title: "执行失败", tone: "red" };
}

export function WorkbenchBannerStack(props: {
  error: string;
  authRequired: boolean;
  bootstrap: WorkbenchBootstrap | null;
  executionReceipt: ExecutionReceipt | null;
  onClearExecutionReceipt: () => void;
}) {
  const actionLinkClassName = "inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--text)]";

  return (
    <>
      {props.error ? (
        <DeepLedgerNoticeBox
          tone="red"
          title="工作台加载失败"
          icon={<AlertCircle className="h-4 w-4" />}
          description={props.authRequired ? "当前会话未登录或已失效，请重新登录后再访问工作台。" : props.error}
          action={props.authRequired ? (
            <Link href="/daa/login?returnTo=%2Fdaa%2Fdashboard%2Fworkbench" className="text-xs font-medium text-[var(--primary)] underline underline-offset-4">
              前往登录
            </Link>
          ) : null}
        />
      ) : null}

      {props.bootstrap?.marketDataHealth && props.bootstrap.marketDataHealth.status !== "ok" ? (
        <DeepLedgerNoticeBox
          tone={props.bootstrap.marketDataHealth.status === "down" ? "red" : "amber"}
          title={props.bootstrap.marketDataHealth.status === "down" ? "市场数据不可用" : "市场数据已降级"}
          icon={<AlertCircle className="h-4 w-4" />}
          description={props.bootstrap.marketDataHealth.message}
        >
          <div className="font-[var(--font-mono)] text-xs text-[var(--muted)]">
            {(() => {
              const totalTracked = props.bootstrap.marketDataHealth.freshCount + props.bootstrap.marketDataHealth.staleCount + props.bootstrap.marketDataHealth.missingCount;
              const jobSummary = totalTracked <= 0
                ? "近 24h 暂无刷新样本"
                : props.bootstrap.marketDataHealth.freshCount <= 0
                  ? "近 24h 无新鲜行情样本"
                  : `近 24h 失败率 ${props.bootstrap.marketDataHealth.recentJobFailureRatePct.toFixed(1)}%`;
              return `新鲜 ${props.bootstrap.marketDataHealth.freshCount} · 过期 ${props.bootstrap.marketDataHealth.staleCount} · 缺失 ${props.bootstrap.marketDataHealth.missingCount} · ${jobSummary}`;
            })()}
          </div>
        </DeepLedgerNoticeBox>
      ) : null}

      {props.executionReceipt ? (() => {
        const meta = executionReceiptMeta(props.executionReceipt.status);
        return (
          <DeepLedgerNoticeBox
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
              <div className="rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[rgba(8,12,20,0.28)] px-3 py-2 text-xs text-[var(--faint)]">
                详情：{props.executionReceipt.reason}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/daa/dashboard/trades" className={actionLinkClassName}>查看交易记录</Link>
              <DeepLedgerActionButton tone="slate" onClick={props.onClearExecutionReceipt}>关闭回执</DeepLedgerActionButton>
            </div>
          </DeepLedgerNoticeBox>
        );
      })() : null}
    </>
  );
}
