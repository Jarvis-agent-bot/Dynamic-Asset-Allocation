"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Briefcase, Compass, Eye, Scale } from "lucide-react";

import type { WorkbenchTabV1 } from "@/app/daa/dashboard/_hooks/useWorkbenchModelV1";
import { cn } from "@/lib/utils";

export function WorkbenchTabBarV1(props: {
  activeTab: WorkbenchTabV1;
  setActiveTab: Dispatch<SetStateAction<WorkbenchTabV1>>;
  holdingAssets: number;
  watchlistAssets: number;
}) {
  const tabInfo: Record<WorkbenchTabV1, { icon: ReactNode; label: string; count?: number }> = {
    positions: { icon: <Briefcase className="h-3.5 w-3.5" />, label: "持仓", count: props.holdingAssets },
    watchlist: { icon: <Eye className="h-3.5 w-3.5" />, label: "观察列表", count: props.watchlistAssets },
    discovery: { icon: <Compass className="h-3.5 w-3.5" />, label: "资产发现" },
    rebalance: { icon: <Scale className="h-3.5 w-3.5" />, label: "再平衡" },
  };

  return (
    <div className="grid grid-cols-2 gap-2 rounded-[20px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-1.5 sm:grid-cols-4">
      {(["positions", "watchlist", "discovery", "rebalance"] as const).map((tab) => {
        const isActive = props.activeTab === tab;
        const info = tabInfo[tab];
        return (
          <button
            key={tab}
            type="button"
            onClick={() => props.setActiveTab(tab)}
            className={cn(
              "flex min-w-0 items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "border border-[var(--primary)]/30 bg-[rgba(56,189,248,0.12)] text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                : "border border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
            )}
          >
            {info.icon}
            <span>{info.label}</span>
            {info.count !== undefined ? (
              <span className={cn("font-[var(--font-mono)] text-[11px]", isActive ? "text-[var(--text)]" : "text-[var(--faint)]")}>{info.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
