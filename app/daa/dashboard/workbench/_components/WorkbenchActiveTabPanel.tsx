"use client";

import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";

import AssetDiscoveryPanel from "../../portfolio/_components/workbench/AssetDiscoveryPanel";
import AssetUniverseTable from "../../portfolio/_components/workbench/AssetUniverseTable";
import { WorkbenchCashSection } from "./WorkbenchCashSection";
import { WorkbenchRebalanceSection } from "./WorkbenchRebalanceSection";
import { WorkbenchTabBar } from "./WorkbenchTabBar";

export function WorkbenchActiveTabPanel(props: {
  model: WorkbenchPageModel;
}) {
  const { model } = props;

  return (
    <div className="space-y-4">
      <WorkbenchTabBar
        activeTab={model.activeTab}
        setActiveTab={model.setActiveTab}
        holdingAssets={model.summary.holdingAssets}
        watchlistAssets={model.summary.watchlistAssets}
      />

      {model.activeTab === "positions" ? <AssetUniverseTable {...model.tableProps} view="holdings" /> : null}
      {model.activeTab === "watchlist" ? <AssetUniverseTable {...model.tableProps} view="watchlist" /> : null}
      {model.activeTab === "discovery" ? <AssetDiscoveryPanel {...model.discoveryProps} /> : null}
      {model.activeTab === "rebalance" && model.rebalanceSectionProps ? <WorkbenchRebalanceSection {...model.rebalanceSectionProps} /> : null}
      {model.activeTab === "cash" ? <WorkbenchCashSection baseCurrency={model.bootstrap?.baseCurrency || "USD"} onCashChanged={() => void model.loadBootstrap(true)} /> : null}
    </div>
  );
}
