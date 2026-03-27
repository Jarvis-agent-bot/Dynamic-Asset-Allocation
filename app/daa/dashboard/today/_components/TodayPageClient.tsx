"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TodayReadModel } from "@/src/daa/modules/today/todayTypes";
import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { DaaSurfaceSectionAnchor } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

import { WorkbenchBannerStack } from "@/app/daa/dashboard/workbench/_components/WorkbenchBannerStack";
import { WorkbenchSummaryHeader } from "@/app/daa/dashboard/workbench/_components/WorkbenchSummaryHeader";
import { WorkbenchCockpitSection } from "@/app/daa/dashboard/workbench/_components/WorkbenchCockpitSection";
import { WorkbenchActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanel";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import {
  getWorkbenchHref,
  resolveWorkbenchTabFromLocation,
  shouldHandleWorkbenchAnchorClick,
} from "@/app/daa/dashboard/workbench/_components/workbenchNavigation";

import ConclusionCard from "./ConclusionCard";
import SignalSeats from "./SignalSeats";
import ActionCard from "./ActionCard";
import PortfolioHealthBar from "./PortfolioHealthBar";

// ─────────────────────────────────────────────────────────────────────────────
// Today decision data (独立于 workbench 的决策层数据)
// ─────────────────────────────────────────────────────────────────────────────

function useTodayDecision() {
  const [model, setModel] = useState<TodayReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/daa/today");
      const json = await res.json();
      if (json.ok) {
        setModel(json.data);
        setError(null);
      } else {
        setError(json.error?.message ?? "决策数据加载失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/daa/today", { method: "PUT" });
      const json = await res.json();
      if (json.ok) {
        setModel(json.data);
        setError(null);
      }
    } catch {
      // 刷新失败不覆盖已有数据
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleDecision = useCallback(
    async (assetKey: string, conclusion: string, userAction: string, llmReason?: string) => {
      try {
        await fetch("/api/daa/today", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetKey, conclusion, userAction, llmReason }),
        });
        await fetchData();
      } catch {
        // 决策记录失败不阻塞 UI
      }
    },
    [fetchData],
  );

  useEffect(() => { fetchData(); }, [fetchData]);

  return { model, loading, refreshing, error, handleRefresh, handleDecision };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified page: 决策层 + 操作层
// ─────────────────────────────────────────────────────────────────────────────

export default function TodayPageClient(props: {
  initialTab?: string;
  initialSection?: string;
}) {
  // ── 决策层数据 ──
  const today = useTodayDecision();

  // ── 操作层数据（原 workbench） ──
  const wbModel = useWorkbenchPageModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const tabParam = searchParams.get("tab");

  useEffect(() => {
    const nextTab = resolveWorkbenchTabFromLocation({
      section: sectionParam || props.initialSection,
      searchTab: tabParam || props.initialTab,
      fallbackTab: wbModel.activeTab,
    });
    if (wbModel.activeTab !== nextTab) wbModel.setActiveTab(nextTab);
  }, [wbModel.activeTab, wbModel.setActiveTab, props.initialSection, props.initialTab, sectionParam, tabParam]);

  useEffect(() => {
    if (!sectionParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("section");
    const nextTab = resolveWorkbenchTabFromLocation({
      section: sectionParam,
      searchTab: tabParam || props.initialTab,
      fallbackTab: wbModel.activeTab,
    });
    params.set("tab", nextTab);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [wbModel.activeTab, pathname, props.initialTab, router, searchParams, sectionParam, tabParam]);

  function navigateToTab(tab: WorkbenchTab) {
    wbModel.setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("section");
    params.set("tab", tab);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  function handleSectionAnchor(event: MouseEvent<HTMLAnchorElement>, tab: WorkbenchTab) {
    if (!shouldHandleWorkbenchAnchorClick(event)) return;
    event.preventDefault();
    navigateToTab(tab);
  }

  const activeTopTab = wbModel.activeTab === "watchlist" ? "watchlist" : wbModel.activeTab;
  const portfolioTab = wbModel.activeTab === "watchlist" ? "watchlist" : "positions";
  const navigationItems = useMemo<Array<{ key: WorkbenchTab; label: string; active: boolean }>>(() => [
    { key: portfolioTab, label: "组合", active: wbModel.activeTab === "watchlist" || wbModel.activeTab === "positions" },
    { key: "rebalance" as WorkbenchTab, label: "调仓", active: activeTopTab === "rebalance" },
    { key: "cash" as WorkbenchTab, label: "现金", active: activeTopTab === "cash" },
  ], [portfolioTab, wbModel.activeTab, activeTopTab]);

  // ── 决策层 UI ──
  const todayModel = today.model;
  const actionItems = todayModel?.llmOutput.actionItems ?? [];
  const todaySection = todayModel ? (
    <>
      <div className="flex items-start justify-between gap-4">
        <ConclusionCard llmOutput={todayModel.llmOutput} isStale={todayModel.isStale} />
        <button
          onClick={today.handleRefresh}
          disabled={today.refreshing}
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs
                     text-muted-foreground transition hover:bg-muted disabled:opacity-50"
          title="手动刷新 AI 分析"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${today.refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      <SignalSeats seats={todayModel.decisionContext.signalSeats} />

      {actionItems.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            需要关注 ({actionItems.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actionItems.map((item) => (
              <ActionCard
                key={item.assetKey}
                item={item}
                overallConclusion={todayModel.llmOutput.conclusion}
                onDecision={today.handleDecision}
              />
            ))}
          </div>
        </section>
      )}

      <PortfolioHealthBar health={todayModel.portfolioHealth} />
    </>
  ) : today.loading ? (
    <div className="flex items-center justify-center py-8 text-muted-foreground">
      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
      正在加载决策摘要…
    </div>
  ) : today.error ? (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      决策摘要加载失败: {today.error}
      <button
        onClick={() => { void today.handleRefresh(); }}
        className="ml-3 underline hover:no-underline"
      >
        重试
      </button>
    </div>
  ) : null;

  // ── 完整页面 ──
  return (
    <div className="space-y-4">
      {/* ═══ 决策层：回答"今天要不要动作" ═══ */}
      <div className="space-y-6">{todaySection}</div>

      {/* ═══ 分隔线 ═══ */}
      {todayModel && (
        <div className="flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">操作面板</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* ═══ 操作层：原 workbench 内容 ═══ */}
      <WorkbenchBannerStack
        error={wbModel.error}
        authRequired={wbModel.authRequired}
        bootstrap={wbModel.bootstrap}
        executionReceipt={wbModel.executionReceipt}
        onClearExecutionReceipt={wbModel.clearExecutionReceipt}
      />

      <WorkbenchSummaryHeader
        baseCurrency={wbModel.bootstrap?.baseCurrency || "USD"}
        totalEquity={wbModel.totalEquity}
        holdingsValue={wbModel.holdingsValue}
        availableCashValue={wbModel.availableCashValue}
        frozenCashValue={wbModel.frozenCashValue}
        cashMutationsAllowed={wbModel.bootstrap?.account.cashMutationsAllowed ?? true}
        readOnlyReason={wbModel.bootstrap?.account.readOnlyReason || null}
        accountBreakdown={wbModel.bootstrap?.account.accountBreakdown || []}
        ledgerMeta={wbModel.ledgerMeta}
        marketDataHealth={wbModel.bootstrap?.marketDataHealth || null}
        equityDelta={wbModel.equityDelta}
        notificationStatus={wbModel.notificationStatus}
        loading={wbModel.loading && !wbModel.bootstrap}
        refreshing={wbModel.refreshing}
        priceStreamConnected={wbModel.priceStreamConnected}
        onRefresh={() => void wbModel.loadBootstrap(true)}
      />

      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="驾驶舱">
          <WorkbenchCockpitSection model={wbModel} />
        </SectionErrorBoundary>
      ) : null}

      <div className="space-y-4">
        <div className="grid gap-2 rounded-[18px] border border-[var(--border)] bg-[rgba(13,19,32,0.8)] p-2 md:grid-cols-3">
          {navigationItems.map((item) => (
            <DaaSurfaceSectionAnchor
              key={item.key}
              href={getWorkbenchHref(item.key)}
              label={item.label}
              active={item.active}
              onClick={(event) => handleSectionAnchor(event, item.key)}
            />
          ))}
        </div>

        {wbModel.bootstrap ? (
          <SectionErrorBoundary sectionName="标签面板">
            <WorkbenchActiveTabPanel model={wbModel} onNavigateTab={navigateToTab} />
          </SectionErrorBoundary>
        ) : null}
      </div>

      <WorkbenchDialogs {...wbModel.dialogProps} />
    </div>
  );
}
