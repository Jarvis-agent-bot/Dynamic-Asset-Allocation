"use client";

import type { DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import type { DashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { cn } from "@/lib/utils";

import { TargetWeightSummary } from "@/app/daa/dashboard/portfolio/_components/TargetWeightSummary";
import { PortfolioHoldingsList } from "@/app/daa/dashboard/portfolio/_components/PortfolioHoldingsList";
import { WatchlistItemList } from "@/app/daa/dashboard/portfolio/_components/WatchlistItemList";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import {
  DaaSurfaceEmptyState,
  DaaSurfacePanel,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";

import { WatchlistSearchBar } from "@/app/daa/dashboard/portfolio/_components/WatchlistSearchBar";
import AssetUniverseTable from "./AssetUniverseTable";
import { RiskOverview } from "./RiskOverview";

export function ActiveTabPanel(props: {
  model: DashboardPageModel;
  onNavigateTab?: (tab: DashboardTab) => void;
}) {
  const { model } = props;

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="inline-flex rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-1.5" role="tablist">
        {([
          { key: "positions", label: `持仓 ${model.summary.holdingAssets}` },
          { key: "watchlist", label: `观察列表 ${model.summary.watchlistAssets}` },
          { key: "analysis", label: "分析" },
        ] as const).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={model.activeTab === item.key}
            aria-controls={`tabpanel-${item.key}`}
            onClick={() => (props.onNavigateTab ? props.onNavigateTab(item.key) : model.setActiveTab(item.key))}
            className={cn(
              "rounded-[12px] px-3 py-2 text-sm transition-colors",
              model.activeTab === item.key
                ? "bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 持仓列表（OKX 风格） */}
      {model.activeTab === "positions" ? (
        <PortfolioHoldingsList
          rows={model.tableProps.rows}
          baseCurrency={model.bootstrap?.baseCurrency || "USD"}
        />
      ) : null}

      {/* 观察列表（OKX 风格） + 搜索添加 */}
      {model.activeTab === "watchlist" ? (
        <div className="space-y-4">
          <TargetWeightSummary rows={model.tableProps.rows} />
          <WatchlistSearchBar {...model.watchlistBuilderProps} />
          <WatchlistItemList rows={model.tableProps.rows} />
        </div>
      ) : null}

      {/* 分析面板 — 风控概览（现金流水已移至交易记录页，入金/出金已提至组合概览） */}
      {model.activeTab === "analysis" ? (
        <div className="space-y-4">
          {model.bootstrap ? (
            <SectionErrorBoundary sectionName="组合风险">
              <RiskOverview
                bootstrap={model.bootstrap}
                snapshots={model.snapshots}
                latestCycle={model.bootstrap.latestCycle ?? null}
                currentRiskCheck={model.bootstrap.latestCycle?.riskCheck ?? null}
              />
            </SectionErrorBoundary>
          ) : (
            <DaaSurfacePanel accent="indigo" title="组合分析" subtitle="风险概览与归因">
              <DaaSurfaceEmptyState
                title="分析面板"
                description="风险仪表盘和绩效归因将在此展示"
              />
            </DaaSurfacePanel>
          )}
        </div>
      ) : null}
    </div>
  );
}
