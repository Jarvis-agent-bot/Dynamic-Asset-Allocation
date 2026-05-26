"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Bot, Newspaper, ReceiptText, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";
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
      { key: "orders", label: "交易活动", icon: <ReceiptText className="h-3.5 w-3.5" /> },
      { key: "news", label: "市场资讯", icon: <Newspaper className="h-3.5 w-3.5" /> },
      { key: "agent", label: "研究观点", icon: <Bot className="h-3.5 w-3.5" /> },
    ];
    if (row.watchEnabled && row.holdingQty === 0) {
      items.push({ key: "auto-entry", label: "入场候选", icon: <Settings2 className="h-3.5 w-3.5" /> });
    }
    return items;
  }, [row.holdingQty, row.watchEnabled]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === active)) setActive("technical");
  }, [active, tabs]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#1a222a] bg-[#080b0e]">
      <div role="tablist" aria-label="资产详情信息" className="flex gap-0 overflow-x-auto border-b border-[#151b22] bg-[#0b0f13] px-2">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "relative inline-flex h-10 shrink-0 items-center gap-1.5 px-3 text-xs font-semibold transition-colors",
              active === tab.key
                ? "text-[#f3f6f8]"
                : "text-[#8a939f] hover:text-[#d6dde5]",
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count ? <span className="text-[var(--faint)]">{tab.count}</span> : null}
            {active === tab.key ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#a3ff12]" /> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="bg-[#080b0e]">
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
