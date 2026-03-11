"use client";

import type { WorkbenchPageModelV1 } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModelV1";

import AssetDiscoveryPanel from "../../portfolio/_components/workbench/AssetDiscoveryPanel";
import AssetUniverseTable from "../../portfolio/_components/workbench/AssetUniverseTable";
import { WorkbenchRebalanceSectionV1 } from "./WorkbenchRebalanceSectionV1";
import { WorkbenchTabBarV1 } from "./WorkbenchTabBarV1";

export function WorkbenchActiveTabPanelV1(props: {
  model: WorkbenchPageModelV1;
}) {
  const { model } = props;

  return (
    <div className="space-y-4">
      <WorkbenchTabBarV1
        activeTab={model.activeTab}
        setActiveTab={model.setActiveTab}
        holdingAssets={model.summary.holdingAssets}
        watchlistAssets={model.summary.watchlistAssets}
      />

      {model.activeTab === "positions" ? <AssetUniverseTable {...model.tableProps} view="holdings" /> : null}
      {model.activeTab === "watchlist" ? <AssetUniverseTable {...model.tableProps} view="watchlist" /> : null}
      {model.activeTab === "discovery" ? <AssetDiscoveryPanel {...model.discoveryProps} /> : null}
      {model.activeTab === "rebalance" && model.rebalanceSectionProps ? <WorkbenchRebalanceSectionV1 {...model.rebalanceSectionProps} /> : null}
    </div>
  );
}
