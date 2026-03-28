"use client";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { cn } from "@/lib/utils";

import AssetUniverseTable from "./AssetUniverseTable";
import WatchlistBuilderPanel from "./WatchlistBuilderPanel";

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
          <AssetUniverseTable {...model.tableProps} view="watchlist" />
          <WatchlistBuilderPanel {...model.watchlistBuilderProps} />
        </div>
      ) : null}
    </div>
  );
}
