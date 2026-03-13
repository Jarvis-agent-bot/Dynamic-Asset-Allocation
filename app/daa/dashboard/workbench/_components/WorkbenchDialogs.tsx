"use client";

import { Dialog } from "@/components/ui/dialog";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import {
  DeepLedgerActionButton,
  DeepLedgerDialogShell,
  DeepLedgerEmptyState,
  DeepLedgerNoticeBox,
  DeepLedgerStatusPill,
  deepLedgerFieldClassName,
  deepLedgerMonoPanelClassName,
  deepLedgerSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { cn } from "@/lib/utils";

import MarketOrderDialog from "../../portfolio/_components/workbench/MarketOrderDialog";

export function WorkbenchDialogs(props: WorkbenchPageModel["dialogProps"]) {
  return (
    <>
      <MarketOrderDialog
        open={Boolean(props.orderDraft)}
        row={props.orderDraft?.row || null}
        side={props.orderDraft?.side || "BUY"}
        loading={props.orderSubmitting}
        onOpenChange={(next) => {
          if (!next) props.setOrderDraft(null);
        }}
        onPreview={props.onPreview}
        onSubmit={props.onSubmitOrder}
      />

      <Dialog open={Boolean(props.calibrationDraft)} onOpenChange={(open) => {
        if (!open) props.setCalibrationDraft(null);
      }}>
        <DeepLedgerDialogShell
          accent="indigo"
          className="max-w-lg"
          title="手动校准持仓"
          description="用于修正手续费、分红或外部调仓导致的账面偏差。校准后会影响再平衡计算。"
          badges={<DeepLedgerStatusPill tone="indigo">手动校准</DeepLedgerStatusPill>}
          footer={(
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DeepLedgerActionButton tone="slate" className="justify-center" onClick={() => props.setCalibrationDraft(null)}>取消</DeepLedgerActionButton>
              <DeepLedgerActionButton tone="primary" className="justify-center" onClick={() => void props.onSubmitCalibration()} disabled={props.calibrating || props.busy}>
                {props.calibrating ? "保存中…" : "保存校准"}
              </DeepLedgerActionButton>
            </div>
          )}
        >
          {props.calibrationDraft ? (
            <div className="space-y-4">
              <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3 text-sm text-[var(--muted)]")}>
                标的：<span className="font-[var(--font-mono)] text-[var(--text)]">{props.calibrationDraft.row.symbol}</span> · {props.calibrationDraft.row.market}
              </div>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">持仓数量</span>
                <input type="number" min="0" step="0.000001" className={deepLedgerFieldClassName} value={props.calibrationDraft.qty} onChange={(e) => props.setCalibrationDraft((prev) => prev ? { ...prev, qty: e.target.value } : prev)} />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">持仓均价（{props.calibrationDraft.row.currency}）</span>
                <input type="number" min="0" step="0.0001" className={deepLedgerFieldClassName} value={props.calibrationDraft.holdingPrice} onChange={(e) => props.setCalibrationDraft((prev) => prev ? { ...prev, holdingPrice: e.target.value } : prev)} />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">总成本（{props.calibrationDraft.row.currency}，可留空自动计算）</span>
                <input type="number" min="0" step="0.01" className={deepLedgerFieldClassName} value={props.calibrationDraft.costBasis} onChange={(e) => props.setCalibrationDraft((prev) => prev ? { ...prev, costBasis: e.target.value } : prev)} />
              </label>
            </div>
          ) : null}
        </DeepLedgerDialogShell>
      </Dialog>

      <Dialog open={Boolean(props.pendingExecuteMode)} onOpenChange={(open) => {
        if (!open) props.setPendingExecuteMode(null);
      }}>
        <DeepLedgerDialogShell
          accent={props.executeSummary?.riskOverallStatus === "block" ? "red" : props.executeSummary?.riskOverallStatus === "warn" ? "amber" : "green"}
          className="max-w-lg"
          title="确认执行再平衡"
          description="系统仅会在你确认后下单执行，自动触发不会自动执行交易。"
          badges={<DeepLedgerStatusPill tone={props.pendingExecuteMode === "all" ? "amber" : "green"}>{props.pendingExecuteMode === "all" ? "执行全部" : "执行选中"}</DeepLedgerStatusPill>}
          footer={(
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DeepLedgerActionButton tone="slate" className="justify-center" onClick={() => props.setPendingExecuteMode(null)}>取消</DeepLedgerActionButton>
              <DeepLedgerActionButton
                tone={props.executeSummary?.riskOverallStatus === "block" ? "danger" : "primary"}
                className="justify-center"
                onClick={() => void props.onConfirmExecute()}
                disabled={props.busy || props.executeSummaryLoading || !props.executeSummary || props.executeSummary.riskOverallStatus === "block"}
              >
                {!props.executeSummary ? "摘要未就绪" : (props.executeSummary.riskOverallStatus === "block" ? "存在阻断，无法执行" : "确认执行")}
              </DeepLedgerActionButton>
            </div>
          )}
        >
          <div className="space-y-4">
            <div className={cn(deepLedgerSubtlePanelClassName, "space-y-1 px-4 py-3 text-sm text-[var(--muted)]")}>
              <div>模式：{props.pendingExecuteMode === "all" ? "执行全部建议" : "仅执行勾选建议"}</div>
              <div>周期：{props.currentCycle ? props.currentCycle.cycleId.slice(0, 8) : "-"}</div>
              <div>订单数：{props.executeSummary?.orderCount ?? (props.currentCycle ? props.currentCycle.proposals.filter((row) => props.pendingExecuteMode === "all" || row.selected).length : 0)}</div>
            </div>
            {props.executeSummaryLoading ? (
              <DeepLedgerEmptyState className="px-4 py-6" title="正在生成执行摘要…" description="请稍候，系统正在合并订单、手续费与风险结论。" />
            ) : null}
            {props.executeSummaryError ? <DeepLedgerNoticeBox tone="red" title="执行摘要生成失败" description={props.executeSummaryError} /> : null}
            {props.executeSummary ? (
              <div className="space-y-3">
                <div className={deepLedgerMonoPanelClassName}>
                  <div>总买入：{formatCurrency(props.executeSummary.buyNotional, props.baseCurrency)}</div>
                  <div>总卖出：{formatCurrency(props.executeSummary.sellNotional, props.baseCurrency)}</div>
                  <div>预计手续费：{formatCurrency(props.executeSummary.estimatedFees, props.baseCurrency)}</div>
                  <div>净现金变化：{formatCurrency(props.executeSummary.netCashImpact, props.baseCurrency)}</div>
                  <div>执行后最大仓位预估：{(props.executeSummary.topWeightChanges[0]?.projectedWeightPct || 0).toFixed(2)}%</div>
                </div>
                {props.executeSummary.riskWarnings.length > 0 ? (
                  <DeepLedgerNoticeBox tone="amber" title="风险提示" description={props.executeSummary.riskWarnings.join("；")} />
                ) : null}
              </div>
            ) : null}
          </div>
        </DeepLedgerDialogShell>
      </Dialog>
    </>
  );
}
