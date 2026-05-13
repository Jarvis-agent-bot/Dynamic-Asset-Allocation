"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Bot, Newspaper, ReceiptText, Settings2 } from "lucide-react";

import { DaaSurfaceFilterChip } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

import { AgentViewPanel } from "./AgentViewPanel";
import { AssetNewsList } from "./AssetNewsList";
import { AssetOrderHistoryPanel } from "./AssetOrderHistoryPanel";
import { AssetTechnicalPanel } from "./AssetTechnicalPanel";
import { WatchlistAutoEntryPanel } from "./WatchlistAutoEntryPanel";

type TabKey = "technical" | "news" | "agent" | "orders" | "auto-entry";

export function AssetDetailTabs({ row }: { row: AssetUniverseView }) {
  const [active, setActive] = useState<TabKey>("technical");
  const tabs = useMemo(() => {
    const items: Array<{ key: TabKey; label: string; count?: string; icon: ReactNode }> = [
      { key: "technical", label: "技术指标", icon: <Activity className="h-3.5 w-3.5" /> },
      { key: "news", label: "新闻", icon: <Newspaper className="h-3.5 w-3.5" /> },
      { key: "agent", label: "Agent", icon: <Bot className="h-3.5 w-3.5" /> },
      { key: "orders", label: "订单", icon: <ReceiptText className="h-3.5 w-3.5" /> },
    ];
    if (row.watchEnabled && row.holdingQty === 0) {
      items.push({ key: "auto-entry", label: "自动建仓", icon: <Settings2 className="h-3.5 w-3.5" /> });
    }
    return items;
  }, [row.holdingQty, row.watchEnabled]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === active)) setActive("technical");
  }, [active, tabs]);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="资产详情信息" className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <DaaSurfaceFilterChip
            key={tab.key}
            active={active === tab.key}
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className="gap-1.5"
          >
            {tab.icon}
            {tab.label}
            {tab.count ? <span className="text-[var(--faint)]">{tab.count}</span> : null}
          </DaaSurfaceFilterChip>
        ))}
      </div>

      <div role="tabpanel">
        {active === "technical" ? (
          <AssetTechnicalPanel symbol={row.yfinanceSymbol || row.symbol} currency={row.currency} />
        ) : null}
        {active === "news" ? <AssetNewsList symbol={row.symbol} /> : null}
        {active === "agent" ? <AgentViewPanel assetKey={row.assetKey} /> : null}
        {active === "orders" ? <AssetOrderHistoryPanel symbol={row.symbol} /> : null}
        {active === "auto-entry" ? (
          <WatchlistAutoEntryPanel
            assetKey={row.assetKey}
            assetSnapshot={{
              fxMissing: row.fxMissing,
              lastPrice: row.lastPrice,
              holdingPrice: row.holdingPrice,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
