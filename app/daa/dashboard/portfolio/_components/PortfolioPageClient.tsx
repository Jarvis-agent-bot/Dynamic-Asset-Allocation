"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Dialog } from "@/components/ui/dialog";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfaceActionButton, DaaSurfaceDialogShell } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { getSystemConfig, patchSystemConfig } from "@/src/daa/modules/store/storeApi";

import { WorkbenchPortfolioStatus } from "@/app/daa/dashboard/workbench/_components/WorkbenchPortfolioStatus";
import { WorkbenchActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanel";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { resolveWorkbenchTabFromLocation } from "@/app/daa/dashboard/workbench/_components/workbenchNavigation";

export default function PortfolioPageClient(props: { initialTab?: string }) {
  const wbModel = useWorkbenchPageModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [emergencyAction, setEmergencyAction] = useState<"liquidate" | "freeze" | null>(null);
  const [emergencyBusy, setEmergencyBusy] = useState(false);

  useEffect(() => {
    const nextTab = resolveWorkbenchTabFromLocation({
      section: null,
      searchTab: tabParam || props.initialTab,
      fallbackTab: wbModel.activeTab,
    });
    if (wbModel.activeTab !== nextTab) wbModel.setActiveTab(nextTab);
  }, [wbModel.activeTab, wbModel.setActiveTab, props.initialTab, tabParam]);

  function navigateToTab(tab: WorkbenchTab) {
    wbModel.setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const holdingRows = wbModel.tableProps.rows.filter((r) => r.holdingQty > 0);

  return (
    <div className="space-y-4">
      {/* 紧急操作入口 */}
      {wbModel.bootstrap && holdingRows.length > 0 ? (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEmergencyAction("liquidate")}
            aria-label="紧急清仓所有持仓"
            className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            紧急清仓
          </button>
          <button
            type="button"
            onClick={() => setEmergencyAction("freeze")}
            aria-label="冻结所有交易操作"
            className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            冻结交易
          </button>
        </div>
      ) : null}

      {/* 组合快照（摘要+图表，现金摘要在摘要行内） */}
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="组合状态">
          <WorkbenchPortfolioStatus
            baseCurrency={wbModel.bootstrap.baseCurrency}
            totalEquity={wbModel.totalEquity}
            holdingsValue={wbModel.holdingsValue}
            availableCashValue={wbModel.availableCashValue}
            frozenCashValue={wbModel.frozenCashValue}
            equityDelta={wbModel.equityDelta}
            snapshots={wbModel.snapshots || []}
            allocationSummary={wbModel.allocationSummary}
            loading={wbModel.loading && !wbModel.bootstrap}
            refreshing={wbModel.refreshing}
            priceStreamConnected={wbModel.priceStreamConnected}
            onRefresh={() => void wbModel.loadBootstrap(true)}
          />
        </SectionErrorBoundary>
      ) : null}

      {/* 持仓 / 观察列表 */}
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="资产工作台">
          <WorkbenchActiveTabPanel model={wbModel} onNavigateTab={navigateToTab} />
        </SectionErrorBoundary>
      ) : null}

      <WorkbenchDialogs {...wbModel.dialogProps} />

      {/* 紧急操作确认弹窗 */}
      <Dialog open={emergencyAction !== null} onOpenChange={(open) => {
        if (!open) setEmergencyAction(null);
      }}>
        <DaaSurfaceDialogShell
          accent="red"
          className="max-w-md"
          title={emergencyAction === "liquidate" ? "紧急清仓全部持仓" : "冻结交易"}
          description={
            emergencyAction === "liquidate"
              ? "将为所有持仓生成 SELL 订单并立即执行。此操作不可撤销。"
              : "冻结后将无法执行任何交易，直到手动解除。"
          }
          footer={(
            <div className="flex justify-end gap-2">
              <DaaSurfaceActionButton tone="slate" onClick={() => setEmergencyAction(null)}>
                取消
              </DaaSurfaceActionButton>
              <DaaSurfaceActionButton
                tone="danger"
                disabled={emergencyBusy}
                onClick={async () => {
                  setEmergencyBusy(true);
                  try {
                    if (emergencyAction === "liquidate") {
                      const results = await Promise.allSettled(
                        holdingRows.map((h) =>
                          fetch("/api/daa/workbench/execution/execute", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              assetKey: h.assetKey,
                              side: "SELL",
                              qty: h.holdingQty,
                              reason: "紧急清仓",
                            }),
                          }),
                        ),
                      );
                      const succeeded = results.filter((r) => r.status === "fulfilled").length;
                      const failed = results.length - succeeded;
                      if (failed > 0) {
                        toast.warning(`${succeeded} 笔清仓成功, ${failed} 笔失败，请检查持仓状态`);
                      } else {
                        toast.success(`已提交 ${holdingRows.length} 笔清仓订单`);
                      }
                      void wbModel.loadBootstrap(true);
                    } else {
                      const current = await getSystemConfig();
                      await patchSystemConfig({
                        baseVersion: current.version,
                        patches: [{ path: "strategy.execution.frozen", value: true }],
                      });
                      toast.success("交易已冻结");
                    }
                  } catch (err) {
                    toast.error("操作失败：" + (err instanceof Error ? err.message : "未知错误"));
                  } finally {
                    setEmergencyBusy(false);
                    setEmergencyAction(null);
                  }
                }}
              >
                {emergencyBusy ? "执行中…" : "确认执行"}
              </DaaSurfaceActionButton>
            </div>
          )}
        >
          {emergencyAction === "liquidate" ? (
            <div className="rounded-[12px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              将清仓以下 {holdingRows.length} 个持仓标的
            </div>
          ) : (
            <div className="rounded-[12px] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
              冻结后所有再平衡执行将被阻止，需要在设置页手动解除冻结。
            </div>
          )}
        </DaaSurfaceDialogShell>
      </Dialog>
    </div>
  );
}
