"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import AssetUniverseTable from "@/app/daa/dashboard/workbench/_components/AssetUniverseTable";
import { WorkbenchBannerStack } from "@/app/daa/dashboard/workbench/_components/WorkbenchBannerStack";
import { WorkbenchCockpitSection } from "@/app/daa/dashboard/workbench/_components/WorkbenchCockpitSection";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { WorkbenchRebalanceSection } from "@/app/daa/dashboard/workbench/_components/WorkbenchRebalanceSection";
import WatchlistBuilderPanel from "@/app/daa/dashboard/workbench/_components/WatchlistBuilderPanel";
import { WorkbenchCompactSummary } from "@/app/daa/dashboard/workbench/_components/WorkbenchCompactSummary";
import { WorkbenchActionCenter } from "@/app/daa/dashboard/workbench/_components/WorkbenchActionCenter";
import { WorkbenchCashCompact } from "@/app/daa/dashboard/workbench/_components/WorkbenchCashCompact";
import { WorkbenchAssistantSheet } from "@/app/daa/dashboard/workbench/_components/WorkbenchAssistantSheet";
import { WorkbenchCashSection } from "@/app/daa/dashboard/workbench/_components/WorkbenchCashSection";
import {
  resolveWorkbenchTabFromLocation,
} from "@/app/daa/dashboard/workbench/_components/workbenchNavigation";
import { cn } from "@/lib/utils";

export default function WorkbenchPageClient(props: {
  initialTab?: string;
  initialSection?: string;
}) {
  const model = useWorkbenchPageModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const tabParam = searchParams.get("tab");
  const [detailsOpen, setDetailsOpen] = useState(true); // 驾驶舱默认展开
  const [cashExpanded, setCashExpanded] = useState(false);
  const [watchlistBuilderOpen, setWatchlistBuilderOpen] = useState(false);

  // 持仓/观察列表子 Tab
  const portfolioTab = model.activeTab === "watchlist" ? "watchlist" : "positions";

  const lastConsumedSectionRef = useRef<string | null>(null);

  useEffect(() => {
    const nextTab = resolveWorkbenchTabFromLocation({
      section: sectionParam || props.initialSection,
      searchTab: tabParam || props.initialTab,
      fallbackTab: model.activeTab,
    });
    if (model.activeTab !== nextTab) {
      model.setActiveTab(nextTab);
    }
  }, [model.activeTab, model.setActiveTab, props.initialSection, props.initialTab, sectionParam, tabParam]);

  useEffect(() => {
    if (!sectionParam || lastConsumedSectionRef.current === sectionParam) return;
    lastConsumedSectionRef.current = sectionParam;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("section");
    const nextTab = resolveWorkbenchTabFromLocation({
      section: sectionParam,
      searchTab: tabParam || props.initialTab,
      fallbackTab: model.activeTab,
    });
    params.set("tab", nextTab);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [sectionParam]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SectionErrorBoundary sectionName="工作台">
      <div className="space-y-3">
        {/* ───── 1. Banners ───── */}
        <WorkbenchBannerStack
          error={model.error}
          authRequired={model.authRequired}
          bootstrap={model.bootstrap}
          executionReceipt={model.executionReceipt}
          onClearExecutionReceipt={model.clearExecutionReceipt}
        />

        {/* ───── 2. 紧凑组合概览 ───── */}
        <WorkbenchCompactSummary
          baseCurrency={model.bootstrap?.baseCurrency || "USD"}
          totalEquity={model.totalEquity}
          holdingsValue={model.holdingsValue}
          availableCashValue={model.availableCashValue}
          equityDelta={model.equityDelta}
          snapshots={model.snapshots || []}
          allocationSummary={model.allocationSummary}
          loading={model.loading && !model.bootstrap}
          refreshing={model.refreshing}
          priceStreamConnected={model.priceStreamConnected}
          onRefresh={() => void model.loadBootstrap(true)}
        />

        {/* ───── 3. 行动中心 ───── */}
        {model.bootstrap ? (
          <WorkbenchActionCenter
            assetRows={model.tableProps.rows}
            currentCycle={model.rebalanceSectionProps?.currentCycle ?? null}
            marketDataHealth={model.bootstrap.marketDataHealth ?? null}
            warnings={model.bootstrap.warnings || []}
          />
        ) : null}

        {/* ───── 4. 持仓表格（单列） ───── */}
        {model.bootstrap ? (
          <div className="space-y-4">
            {/* 持仓/观察列表 sub-tab */}
            <div className="inline-flex rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-1.5" role="tablist">
              {([
                { key: "positions" as const, label: `持仓 ${model.summary.holdingAssets}` },
                { key: "watchlist" as const, label: `观察列表 ${model.summary.watchlistAssets}` },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={portfolioTab === item.key}
                  onClick={() => model.setActiveTab(item.key)}
                  className={cn(
                    "rounded-[12px] px-3 py-2 text-sm transition-colors",
                    portfolioTab === item.key
                      ? "bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <SectionErrorBoundary sectionName="持仓表格">
              {portfolioTab === "positions" ? (
                <AssetUniverseTable {...model.tableProps} view="holdings" />
              ) : (
                <div className="space-y-4">
                  <AssetUniverseTable {...model.tableProps} view="watchlist" />
                  <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text)]">观察池构建工具</div>
                        <div className="mt-1 text-sm leading-6 text-[var(--muted)]">搜索和推荐池，扩充你的候选标的。</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWatchlistBuilderOpen((prev) => !prev)}
                        className="inline-flex items-center justify-center rounded-full border border-[var(--border-strong)] px-3.5 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)]/32 hover:text-[var(--text)]"
                        aria-label={watchlistBuilderOpen ? "收起观察池工具" : "展开观察池工具"}
                      >
                        {watchlistBuilderOpen ? "收起" : "展开"}
                      </button>
                    </div>
                    {watchlistBuilderOpen ? (
                      <div className="mt-4" data-testid="watchlist-builder">
                        <WatchlistBuilderPanel {...model.watchlistBuilderProps} />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </SectionErrorBoundary>
          </div>
        ) : (
          <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.52)] px-6 py-12 text-center">
            <div className="text-sm text-[var(--muted)]">正在准备工作台…</div>
            <div className="mt-2 text-xs text-[var(--faint)]">正在同步账户、观察列表与再平衡周期，请稍候。</div>
          </div>
        )}

        {/* ───── 5. 调仓操作区（单列，不再与持仓并排） ───── */}
        {model.bootstrap && model.rebalanceSectionProps ? (
          <SectionErrorBoundary sectionName="调仓">
            <WorkbenchRebalanceSection {...model.rebalanceSectionProps} />
          </SectionErrorBoundary>
        ) : null}

        {/* ───── 5. 现金摘要 ───── */}
        {model.bootstrap ? (
          <SectionErrorBoundary sectionName="现金">
            {cashExpanded ? (
              <div>
                <WorkbenchCashSection
                  baseCurrency={model.bootstrap.baseCurrency}
                  entries={model.cashLedger || []}
                  ledgerMeta={model.ledgerMeta}
                  cashMutationsAllowed={model.bootstrap.account.cashMutationsAllowed}
                  readOnlyReason={model.bootstrap.account.readOnlyReason}
                  accountBreakdown={model.bootstrap.account.accountBreakdown}
                  onCashChanged={() => void model.loadBootstrap(true)}
                />
                <button
                  type="button"
                  onClick={() => setCashExpanded(false)}
                  className="mt-2 flex w-full items-center justify-center gap-1 py-2 text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                >
                  <ChevronUp className="h-3.5 w-3.5" /> 收起现金详情
                </button>
              </div>
            ) : (
              <WorkbenchCashCompact
                baseCurrency={model.bootstrap.baseCurrency}
                availableCash={model.availableCashValue}
                frozenCash={model.frozenCashValue}
                cashLedger={model.cashLedger || []}
                cashMutationsAllowed={model.bootstrap.account.cashMutationsAllowed}
                onDeposit={() => {/* 由 CashSection dialog 处理 */}}
                onWithdraw={() => {/* 由 CashSection dialog 处理 */}}
                onExpand={() => setCashExpanded(true)}
              />
            )}
          </SectionErrorBoundary>
        ) : null}

        {/* ───── 6. 可折叠驾驶舱详情 ───── */}
        {model.bootstrap ? (
          <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)]">
            <button
              type="button"
              onClick={() => setDetailsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.02)]"
              aria-expanded={detailsOpen}
            >
              <span className="text-sm font-semibold text-[var(--text)]">
                驾驶舱详情
                <span className="ml-2 text-xs font-normal text-[var(--muted)]">信号 · 指标 · 风控 · 图表</span>
              </span>
              {detailsOpen
                ? <ChevronUp className="h-4 w-4 text-[var(--muted)]" />
                : <ChevronDown className="h-4 w-4 text-[var(--muted)]" />
              }
            </button>
            {detailsOpen ? (
              <div className="border-t border-[var(--border)] p-4">
                <SectionErrorBoundary sectionName="驾驶舱">
                  <WorkbenchCockpitSection model={model} />
                </SectionErrorBoundary>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ───── 7. AI 助手 Sheet ───── */}
        <WorkbenchAssistantSheet assistant={model.assistant} />

        {/* ───── 8. Dialogs ───── */}
        <WorkbenchDialogs {...model.dialogProps} />
      </div>
    </SectionErrorBoundary>
  );
}
