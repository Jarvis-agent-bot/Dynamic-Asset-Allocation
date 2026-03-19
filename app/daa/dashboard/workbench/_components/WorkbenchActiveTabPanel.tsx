"use client";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { cn } from "@/lib/utils";

import AssetUniverseTable from "../../portfolio/_components/workbench/AssetUniverseTable";
import WatchlistBuilderPanel from "../../portfolio/_components/workbench/WatchlistBuilderPanel";
import { WorkbenchCashSection } from "./WorkbenchCashSection";
import { WorkbenchRebalanceSection } from "./WorkbenchRebalanceSection";

export function WorkbenchActiveTabPanel(props: {
  model: WorkbenchPageModel;
  onNavigateTab?: (tab: WorkbenchTab) => void;
}) {
  const { model } = props;
  const isPortfolioTab = model.activeTab === "positions" || model.activeTab === "watchlist";

  return (
    <div className="space-y-4">
      {isPortfolioTab ? (
        <div className="inline-flex rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-1.5">
          {([
            { key: "positions", label: `持仓 ${model.summary.holdingAssets}` },
            { key: "watchlist", label: `观察列表 ${model.summary.watchlistAssets}` },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => (props.onNavigateTab ? props.onNavigateTab(item.key) : model.setActiveTab(item.key))}
              className={cn(
                "rounded-[12px] px-3 py-2 text-sm transition-all",
                model.activeTab === item.key
                  ? "bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {model.activeTab === "positions" ? <AssetUniverseTable {...model.tableProps} view="holdings" /> : null}
      {model.activeTab === "watchlist" ? (
        <div className="space-y-4">
          <AssetUniverseTable {...model.tableProps} view="watchlist" />
          <WatchlistBuilderPanel {...model.watchlistBuilderProps} />
        </div>
      ) : null}
      {model.activeTab === "rebalance" && model.rebalanceSectionProps ? (
        <WorkbenchRebalanceSection
          {...model.rebalanceSectionProps}
          onNavigateTab={props.onNavigateTab ?? model.rebalanceSectionProps.onNavigateTab}
        />
      ) : null}
      {model.activeTab === "cash" ? <WorkbenchCashSection baseCurrency={model.bootstrap?.baseCurrency || "USD"} onCashChanged={() => void model.loadBootstrap(true)} /> : null}
    </div>
  );
}
