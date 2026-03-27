"use client";

import { useEffect, useState } from "react";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { cn } from "@/lib/utils";

import AssetUniverseTable from "./AssetUniverseTable";
import WatchlistBuilderPanel from "./WatchlistBuilderPanel";
import { WorkbenchCashSection } from "./WorkbenchCashSection";
import { WorkbenchRebalanceSection } from "./WorkbenchRebalanceSection";

export function WorkbenchActiveTabPanel(props: {
  model: WorkbenchPageModel;
  onNavigateTab?: (tab: WorkbenchTab) => void;
}) {
  const { model } = props;
  const isPortfolioTab = model.activeTab === "positions" || model.activeTab === "watchlist";
  const [watchlistBuilderOpen, setWatchlistBuilderOpen] = useState(model.summary.watchlistAssets <= 0);
  const [watchlistBuilderTouched, setWatchlistBuilderTouched] = useState(false);

  useEffect(() => {
    if (watchlistBuilderTouched) return;
    setWatchlistBuilderOpen(model.summary.watchlistAssets <= 0);
  }, [model.summary.watchlistAssets, watchlistBuilderTouched]);

  return (
    <div className="space-y-4">
      {isPortfolioTab ? (
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
      ) : null}

      {model.activeTab === "positions" ? <AssetUniverseTable {...model.tableProps} view="holdings" /> : null}
      {model.activeTab === "watchlist" ? (
        <div className="space-y-4">
          <AssetUniverseTable {...model.tableProps} view="watchlist" />
          <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">观察池构建工具</div>
                <div className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  推荐池与搜索补充保留在这里，但默认不长期占据主工作区；需要扩充观察列表时再展开即可。
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWatchlistBuilderTouched(true);
                  setWatchlistBuilderOpen((prev) => !prev);
                }}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border-strong)] px-3.5 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)]/32 hover:text-[var(--text)]"
              >
                {watchlistBuilderOpen ? "收起观察池工具" : "展开观察池工具"}
              </button>
            </div>
            {watchlistBuilderOpen ? <div className="mt-4"><WatchlistBuilderPanel {...model.watchlistBuilderProps} /></div> : null}
          </div>
        </div>
      ) : null}
      {model.activeTab === "rebalance" && model.rebalanceSectionProps ? (
        <WorkbenchRebalanceSection
          {...model.rebalanceSectionProps}
          onNavigateTab={props.onNavigateTab ?? model.rebalanceSectionProps.onNavigateTab}
        />
      ) : null}
      {model.activeTab === "cash" ? (
        <WorkbenchCashSection
          baseCurrency={model.bootstrap?.baseCurrency || "USD"}
          entries={model.cashLedger}
          ledgerMeta={model.ledgerMeta}
          cashMutationsAllowed={model.bootstrap?.account.cashMutationsAllowed ?? true}
          readOnlyReason={model.bootstrap?.account.readOnlyReason || null}
          accountBreakdown={model.bootstrap?.account.accountBreakdown || []}
          onCashChanged={() => void model.loadBootstrap(true)}
        />
      ) : null}
    </div>
  );
}
