"use client";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { cn } from "@/lib/utils";

import { TargetWeightSummary } from "@/app/daa/dashboard/portfolio/_components/TargetWeightSummary";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import {
  DaaSurfaceEmptyState,
  DaaSurfacePanel,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";

import AssetUniverseTable from "./AssetUniverseTable";
import WatchlistBuilderPanel from "./WatchlistBuilderPanel";
import { WorkbenchRiskOverview } from "./WorkbenchRiskOverview";
import { WorkbenchCashSection } from "./WorkbenchCashSection";

export function WorkbenchActiveTabPanel(props: {
  model: WorkbenchPageModel;
  onNavigateTab?: (tab: WorkbenchTab) => void;
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

      {/* 持仓表 */}
      {model.activeTab === "positions" ? <AssetUniverseTable {...model.tableProps} view="holdings" /> : null}

      {/* 观察列表 + 添加新标的（直接展示，不折叠） */}
      {model.activeTab === "watchlist" ? (
        <div className="space-y-4">
          <TargetWeightSummary rows={model.tableProps.rows} />
          <AssetUniverseTable {...model.tableProps} view="watchlist" />
          <WatchlistBuilderPanel {...model.watchlistBuilderProps} />
        </div>
      ) : null}

      {/* 分析面板 — 风险、现金分析 */}
      {model.activeTab === "analysis" ? (
        <div className="space-y-4">
          {model.bootstrap ? (
            <>
              <SectionErrorBoundary sectionName="组合风险">
                <WorkbenchRiskOverview
                  bootstrap={model.bootstrap}
                  snapshots={model.snapshots}
                  latestCycle={null}
                  currentRiskCheck={null}
                />
              </SectionErrorBoundary>
              <SectionErrorBoundary sectionName="现金流水">
                <WorkbenchCashSection
                  baseCurrency={model.bootstrap.baseCurrency}
                  entries={model.cashLedger}
                  ledgerMeta={model.ledgerMeta}
                  cashMutationsAllowed={model.bootstrap.account.cashMutationsAllowed}
                  readOnlyReason={model.bootstrap.account.readOnlyReason}
                  accountBreakdown={model.bootstrap.account.accountBreakdown}
                  onCashChanged={() => void model.loadBootstrap(true)}
                />
              </SectionErrorBoundary>
            </>
          ) : (
            <DaaSurfacePanel accent="indigo" title="组合分析" subtitle="风险、归因与现金分析">
              <DaaSurfaceEmptyState
                title="分析面板"
                description="现金分析、汇率敞口、风险仪表盘和绩效归因将在此展示"
              />
            </DaaSurfacePanel>
          )}
        </div>
      ) : null}
    </div>
  );
}
