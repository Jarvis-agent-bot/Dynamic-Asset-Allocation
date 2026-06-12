"use client";

import dynamic from "next/dynamic";
import type { PortfolioWorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchReadModel";
import type { AssetWorkbenchModel } from "@/app/daa/dashboard/_hooks/useAssetWorkbenchModel";
import type { TargetWeightSummaryProps } from "@/app/daa/dashboard/portfolio/_components/TargetWeightSummary";
import { cn } from "@/lib/utils";

import { PortfolioHoldingsList } from "@/app/daa/dashboard/portfolio/_components/PortfolioHoldingsList";
import { WatchlistItemList } from "@/app/daa/dashboard/portfolio/_components/WatchlistItemList";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import {
  DaaSurfaceEmptyState,
  DaaSurfacePanel,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";

import { WatchlistSearchBar } from "@/app/daa/dashboard/portfolio/_components/WatchlistSearchBar";
import { RiskOverview } from "@/app/daa/dashboard/_shared/RiskOverview";
import { countVisibleHoldings } from "@/app/daa/dashboard/_shared/holdingVisibility";

const LazyTargetWeightSummary = dynamic<TargetWeightSummaryProps>(
  () => import("@/app/daa/dashboard/portfolio/_components/TargetWeightSummary").then((mod) => mod.TargetWeightSummary),
  {
    ssr: false,
    loading: () => (
      <DaaSurfacePanel accent="primary" title="目标配置概览" subtitle="正在加载配置图表">
        <div className="h-20 rounded-[var(--radius-md)] bg-[var(--surface)]" />
      </DaaSurfacePanel>
    ),
  },
);

export function PortfolioWorkbenchPanel(props: {
  model: AssetWorkbenchModel;
  onNavigateTab?: (tab: PortfolioWorkbenchTab) => void;
}) {
  const { model } = props;
  const hasTargetWeights = model.tableProps.rows.some((row) => row.watchEnabled && row.targetWeightHint > 0);
  const visibleHoldingCount = countVisibleHoldings(model.tableProps.rows);

  return (
    <div className="space-y-4">
      {/* 组合工作台标签切换 */}
      <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1" role="tablist">
        {([
          { key: "positions", label: `持仓 ${visibleHoldingCount}` },
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
              "min-h-9 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition-colors",
              model.activeTab === item.key
                ? "bg-[var(--primary-bg)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 持仓列表（工作站风格） */}
      {model.activeTab === "positions" ? (
        <PortfolioHoldingsList
          rows={model.tableProps.rows}
          baseCurrency={model.bootstrap?.baseCurrency || "USD"}
        />
      ) : null}

      {/* 观察列表（工作站风格） + 搜索添加 */}
      {model.activeTab === "watchlist" ? (
        <div className="space-y-4">
          {hasTargetWeights ? (
            <LazyTargetWeightSummary
              rows={model.tableProps.rows}
              onTemplateApplied={() => model.loadBootstrap(true)}
            />
          ) : null}
          <WatchlistSearchBar {...model.watchlistBuilderProps} />
          <WatchlistItemList
            rows={model.tableProps.rows}
            onRemoveFromWatchlist={model.tableProps.onRemoveFromWatchlist}
            onUpdateTargetWeight={model.tableProps.onUpdateTargetWeight}
            actioningAssetKey={model.tableProps.actioningAssetKey}
            updatingTarget={model.tableProps.updatingTarget}
            disabled={model.tableProps.disabled}
          />
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
            <DaaSurfacePanel accent="info" title="组合分析" subtitle="风险概览与归因">
              <DaaSurfaceEmptyState
                title="分析面板"
                description="风险复核与绩效归因将在此展示"
              />
            </DaaSurfacePanel>
          )}
        </div>
      ) : null}
    </div>
  );
}
