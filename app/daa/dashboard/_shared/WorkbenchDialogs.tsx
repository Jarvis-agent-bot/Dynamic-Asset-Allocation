"use client";

import { Dialog } from "@/components/ui/dialog";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import type { AssetWorkbenchModel } from "@/app/daa/dashboard/_hooks/useAssetWorkbenchModel";
import {
  DaaSurfaceActionButton,
  DaaSurfaceDialogShell,
  DaaSurfaceEmptyState,
  DaaSurfaceNoticeBox,
  DaaSurfaceStatusPill,
  daaSurfaceFieldClassName,
  daaSurfaceMonoPanelClassName,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";

import { AssetDetailDialog } from "./AssetDetailDialog";
import MarketOrderDialog from "./MarketOrderDialog";

export function WorkbenchDialogs(props: AssetWorkbenchModel["dialogProps"]) {
  return (
    <>
      <AssetDetailDialog
        draft={props.assetDetail}
        onClose={() => props.setAssetDetail(null)}
      />

      <MarketOrderDialog
        open={Boolean(props.orderDraft)}
        row={props.orderDraft?.row || null}
        side={props.orderDraft?.side || "BUY"}
        loading={props.orderSubmitting}
        slippageBps={props.slippageBps}
        onOpenChange={(next) => {
          if (!next) props.setOrderDraft(null);
        }}
        onPreview={props.onPreview}
        onSubmit={props.onSubmitOrder}
      />

      <Dialog open={Boolean(props.calibrationDraft)} onOpenChange={(open) => {
        if (!open) props.setCalibrationDraft(null);
      }}>
        <DaaSurfaceDialogShell
          accent="info"
          className="max-w-lg"
          title="手动校准持仓"
          description="用于修正手续费、分红或外部调仓导致的账面偏差。校准后会影响再平衡计算。"
          badges={<DaaSurfaceStatusPill tone="info">手动校准</DaaSurfaceStatusPill>}
          footer={(
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DaaSurfaceActionButton tone="neutral" className="justify-center" onClick={() => props.setCalibrationDraft(null)}>取消</DaaSurfaceActionButton>
              <DaaSurfaceActionButton tone="primary" className="justify-center" onClick={() => void props.onSubmitCalibration()} disabled={props.calibrating || props.busy}>
                {props.calibrating ? "保存中…" : "保存校准"}
              </DaaSurfaceActionButton>
            </div>
          )}
        >
          {props.calibrationDraft ? (
            <div className="space-y-4">
              <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3 text-sm text-[var(--muted)]")}>
                标的：<span className="font-[var(--font-mono)] text-[var(--text)]">{props.calibrationDraft.row.symbol}</span> · {props.calibrationDraft.row.market}
              </div>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">持仓数量</span>
                <input type="number" min="0" step="0.000001" className={daaSurfaceFieldClassName} value={props.calibrationDraft.qty} onChange={(event) => props.setCalibrationDraft((prev) => prev ? { ...prev, qty: event.target.value } : prev)} />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">持仓均价（{props.calibrationDraft.row.currency}）</span>
                <input type="number" min="0" step="0.0001" className={daaSurfaceFieldClassName} value={props.calibrationDraft.holdingPrice} onChange={(event) => props.setCalibrationDraft((prev) => prev ? { ...prev, holdingPrice: event.target.value } : prev)} />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">总成本（{props.calibrationDraft.row.currency}，可留空自动计算）</span>
                <input type="number" min="0" step="0.01" className={daaSurfaceFieldClassName} value={props.calibrationDraft.costBasis} onChange={(event) => props.setCalibrationDraft((prev) => prev ? { ...prev, costBasis: event.target.value } : prev)} />
              </label>
            </div>
          ) : null}
        </DaaSurfaceDialogShell>
      </Dialog>

      <Dialog open={Boolean(props.pendingExecuteMode)} onOpenChange={(open) => {
        if (!open) props.setPendingExecuteMode(null);
      }}>
        <DaaSurfaceDialogShell
          accent={props.executeSummary?.riskOverallStatus === "block" ? "danger" : props.executeSummary?.riskOverallStatus === "warn" ? "warning" : "success"}
          className="max-w-lg"
          title="确认执行再平衡"
          description="系统仅会在你确认后下单执行，自动触发不会自动执行交易。"
          badges={<DaaSurfaceStatusPill tone={props.pendingExecuteMode === "all" ? "warning" : "success"}>{props.pendingExecuteMode === "all" ? "执行全部" : "执行选中"}</DaaSurfaceStatusPill>}
          footer={(
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DaaSurfaceActionButton tone="neutral" className="justify-center" onClick={() => props.setPendingExecuteMode(null)}>取消</DaaSurfaceActionButton>
              <DaaSurfaceActionButton
                tone={props.executeSummary?.riskOverallStatus === "block" ? "danger" : "primary"}
                className="justify-center"
                onClick={() => void props.onConfirmExecute()}
                disabled={props.busy || props.executeSummaryLoading || !props.executeSummary || props.executeSummary.riskOverallStatus === "block"}
              >
                {!props.executeSummary ? "摘要未就绪" : (props.executeSummary.riskOverallStatus === "block" ? "存在阻断，无法执行" : "确认执行")}
              </DaaSurfaceActionButton>
            </div>
          )}
        >
          <div className="space-y-4">
            <div className={cn(daaSurfaceSubtlePanelClassName, "space-y-1 px-4 py-3 text-sm text-[var(--muted)]")}>
              <div>模式：{props.pendingExecuteMode === "all" ? "执行全部建议" : "仅执行勾选建议"}</div>
              <div>周期：{props.currentCycle ? props.currentCycle.cycleId.slice(0, 8) : "-"}</div>
              <div>订单数：{props.executeSummary?.orderCount ?? (props.currentCycle ? props.currentCycle.proposals.filter((row) => props.pendingExecuteMode === "all" || row.selected).length : 0)}</div>
            </div>
            {props.executeSummaryLoading ? (
              <DaaSurfaceEmptyState className="px-4 py-4" title="正在生成执行摘要…" description="合并订单、费用与风险结论。" />
            ) : null}
            {props.executeSummaryError ? <DaaSurfaceNoticeBox tone="danger" title="执行摘要生成失败" description={props.executeSummaryError} /> : null}
            {props.executeSummary ? (
              <div className="space-y-3">
                <div className={daaSurfaceMonoPanelClassName}>
                  <div>总买入：{formatCurrency(props.executeSummary.buyNotional, props.baseCurrency)}</div>
                  <div>总卖出：{formatCurrency(props.executeSummary.sellNotional, props.baseCurrency)}</div>
                  <div>预计手续费：{formatCurrency(props.executeSummary.estimatedFees, props.baseCurrency)}</div>
                  <div>净现金变化：{formatCurrency(props.executeSummary.netCashImpact, props.baseCurrency)}</div>
                  <div>执行后最大仓位预估：{(props.executeSummary.topWeightChanges[0]?.projectedWeightPct || 0).toFixed(2)}%</div>
                </div>
                {props.executeSummary.riskWarnings.length > 0 ? (
                  <DaaSurfaceNoticeBox tone="warning" title="风险提示" description={props.executeSummary.riskWarnings.join("；")} />
                ) : null}
                <div className="text-xs text-[var(--faint)]">
                  以上为基于最新缓存价格的预估值；执行时会重新拉取实时价并计入滑点，实际成交结果可能略有差异。
                </div>
              </div>
            ) : null}
          </div>
        </DaaSurfaceDialogShell>
      </Dialog>

      {/* 确认取消周期 */}
      <Dialog open={props.pendingConfirm?.type === "cancelCycle"} onOpenChange={(open) => {
        if (!open) props.setPendingConfirm(null);
      }}>
        <DaaSurfaceDialogShell
          accent="danger"
          className="max-w-md"
          title="确认取消周期"
          description="取消后已生成的调仓建议将被清除，此操作不可撤销。"
          badges={<DaaSurfaceStatusPill tone="danger">取消周期</DaaSurfaceStatusPill>}
          footer={(
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DaaSurfaceActionButton tone="neutral" className="justify-center" onClick={() => props.setPendingConfirm(null)}>取消</DaaSurfaceActionButton>
              <DaaSurfaceActionButton
                tone="danger"
                className="justify-center"
                onClick={() => {
                  props.setPendingConfirm(null);
                  void props.onConfirmCancelCycle();
                }}
              >
                确认取消
              </DaaSurfaceActionButton>
            </div>
          )}
        >
          <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3 text-sm text-[var(--muted)]")}>
            本操作将取消当前再平衡周期，已生成的建议不会被执行。如需继续调仓，请重新生成周期。
          </div>
        </DaaSurfaceDialogShell>
      </Dialog>

      {/* 确认移出观察列表 */}
      <Dialog open={props.pendingConfirm?.type === "removeWatchlist"} onOpenChange={(open) => {
        if (!open) props.setPendingConfirm(null);
      }}>
        <DaaSurfaceDialogShell
          accent="danger"
          className="max-w-md"
          title="确认移出观察列表"
          description={`确定要将 ${props.pendingConfirm?.type === "removeWatchlist" ? props.pendingConfirm.row.symbol : ""} 移出观察列表吗？`}
          badges={<DaaSurfaceStatusPill tone="danger">移出观察</DaaSurfaceStatusPill>}
          footer={(
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DaaSurfaceActionButton tone="neutral" className="justify-center" onClick={() => props.setPendingConfirm(null)}>保留</DaaSurfaceActionButton>
              <DaaSurfaceActionButton
                tone="danger"
                className="justify-center"
                onClick={() => {
                  if (props.pendingConfirm?.type === "removeWatchlist") {
                    const { row } = props.pendingConfirm;
                    props.setPendingConfirm(null);
                    void props.onConfirmRemoveFromWatchlist(row);
                  }
                }}
              >
                移出
              </DaaSurfaceActionButton>
            </div>
          )}
        >
          <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3 text-sm text-[var(--muted)]")}>
            移出后该资产将不再参与再平衡计算，目标权重将被清零。
          </div>
        </DaaSurfaceDialogShell>
      </Dialog>
    </>
  );
}
