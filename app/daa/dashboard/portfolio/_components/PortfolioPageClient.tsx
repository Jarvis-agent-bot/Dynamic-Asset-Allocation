"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Dialog } from "@/components/ui/dialog";
import type { DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import {
  DaaSurfaceActionButton,
  DaaSurfaceDialogShell,
  daaSurfaceFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { appendCashLedgerEntry } from "@/src/daa/modules/store/storeApi";
import { cn } from "@/lib/utils";

import { PortfolioStatus } from "@/app/daa/dashboard/workbench/_components/PortfolioStatus";
import { ActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/ActiveTabPanel";
import { DashboardDialogs } from "@/app/daa/dashboard/workbench/_components/DashboardDialogs";
import { resolveTabFromLocation } from "@/app/daa/dashboard/workbench/_components/dashboardNavigation";

export default function PortfolioPageClient(props: { initialTab?: string }) {
  const wbModel = useDashboardPageModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [cashDialogSide, setCashDialogSide] = useState<"deposit" | "withdraw" | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [cashSubmitting, setCashSubmitting] = useState(false);

  useEffect(() => {
    const nextTab = resolveTabFromLocation({
      section: null,
      searchTab: tabParam || props.initialTab,
      fallbackTab: wbModel.activeTab,
    });
    if (wbModel.activeTab !== nextTab) wbModel.setActiveTab(nextTab);
  }, [wbModel.activeTab, wbModel.setActiveTab, props.initialTab, tabParam]);

  function navigateToTab(tab: DashboardTab) {
    wbModel.setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const baseCurrency = wbModel.bootstrap?.baseCurrency || "USD";

  const handleCashSubmit = useCallback(async () => {
    if (!cashDialogSide || cashSubmitting) return;
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请输入大于 0 的金额");
      return;
    }
    setCashSubmitting(true);
    try {
      await appendCashLedgerEntry({
        side: cashDialogSide,
        amount,
        baseCurrency,
        note: cashNote.trim() || undefined,
      });
      toast.success(cashDialogSide === "deposit" ? "入金已记录" : "出金已记录");
      setCashDialogSide(null);
      setCashAmount("");
      setCashNote("");
      void wbModel.loadBootstrap(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setCashSubmitting(false);
    }
  }, [cashDialogSide, cashSubmitting, cashAmount, cashNote, baseCurrency, wbModel]);

  return (
    <div className="space-y-4">
      {/* 组合快照（摘要+图表，现金摘要在摘要行内） */}
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="组合状态">
          <PortfolioStatus
            baseCurrency={baseCurrency}
            totalEquity={wbModel.totalEquity}
            holdingsValue={wbModel.holdingsValue}
            availableCashValue={wbModel.availableCashValue}
            frozenCashValue={wbModel.frozenCashValue}
            equityDelta={wbModel.equityDelta}
            snapshots={wbModel.snapshots || []}
            cashFlowEvents={wbModel.cashLedger?.filter((e) => (e.side === "deposit" || e.side === "withdraw") && e.entryKind === "manual").map((e) => ({ ts: e.ts, side: e.side as "deposit" | "withdraw", amount: e.amountInAccountBase ?? e.amount })) ?? []}
            allocationSummary={wbModel.allocationSummary}
            loading={wbModel.loading && !wbModel.bootstrap}
            refreshing={wbModel.refreshing}
            priceStreamConnected={wbModel.priceStreamConnected}
            onRefresh={() => void wbModel.loadBootstrap(true)}
            onDeposit={() => setCashDialogSide("deposit")}
            onWithdraw={() => setCashDialogSide("withdraw")}
          />
        </SectionErrorBoundary>
      ) : null}

      {/* 持仓 / 观察列表 */}
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="资产列表">
          <ActiveTabPanel model={wbModel} onNavigateTab={navigateToTab} />
        </SectionErrorBoundary>
      ) : null}

      <DashboardDialogs {...wbModel.dialogProps} />

      {/* 入金/出金弹窗 */}
      <Dialog open={cashDialogSide != null} onOpenChange={(open) => { if (!open) { setCashDialogSide(null); setCashAmount(""); setCashNote(""); } }}>
        <DaaSurfaceDialogShell
          accent={cashDialogSide === "deposit" ? "green" : "amber"}
          className="max-w-md"
          title={cashDialogSide === "deposit" ? "入金" : "出金"}
          description={cashDialogSide === "deposit" ? "记录一笔入金到账户" : "记录一笔出金从账户"}
          footer={(
            <div className="flex justify-end gap-2">
              <DaaSurfaceActionButton tone="slate" onClick={() => setCashDialogSide(null)}>取消</DaaSurfaceActionButton>
              <DaaSurfaceActionButton
                tone={cashDialogSide === "deposit" ? "success" : "warning"}
                onClick={() => void handleCashSubmit()}
                disabled={cashSubmitting}
              >
                {cashSubmitting ? "提交中…" : "确认"}
              </DaaSurfaceActionButton>
            </div>
          )}
        >
          <div className="space-y-3">
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]">金额 ({baseCurrency})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="例如 10000"
                className={cn(daaSurfaceFieldClassName, "h-11")}
                autoFocus
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]">备注（可选）</span>
              <input
                type="text"
                value={cashNote}
                onChange={(e) => setCashNote(e.target.value)}
                placeholder="例如：工资入账"
                className={cn(daaSurfaceFieldClassName, "h-11")}
              />
            </label>
          </div>
        </DaaSurfaceDialogShell>
      </Dialog>
    </div>
  );
}
