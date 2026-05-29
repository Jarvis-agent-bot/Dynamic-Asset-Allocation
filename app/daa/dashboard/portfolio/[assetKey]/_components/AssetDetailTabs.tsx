"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Bot, Newspaper, ReceiptText } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

import { AgentViewPanel } from "./AgentViewPanel";
import { AssetNewsList } from "./AssetNewsList";
import { AssetOrderHistoryPanel } from "./AssetOrderHistoryPanel";
import { AssetTechnicalPanel } from "./AssetTechnicalPanel";

type TabKey = "technical" | "news" | "agent" | "orders";

export function AssetDetailTabs({ row }: { row: AssetUniverseView }) {
  const [active, setActive] = useState<TabKey>("technical");
  const tabs = useMemo(() => {
    const items: Array<{ key: TabKey; label: string; count?: string; icon: ReactNode }> = [
      { key: "technical", label: "技术指标", icon: <Activity className="h-3.5 w-3.5" /> },
      { key: "orders", label: "交易活动", icon: <ReceiptText className="h-3.5 w-3.5" /> },
      { key: "news", label: "市场资讯", icon: <Newspaper className="h-3.5 w-3.5" /> },
      { key: "agent", label: "研究观点", icon: <Bot className="h-3.5 w-3.5" /> },
    ];
    return items;
  }, []);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === active)) setActive("technical");
  }, [active, tabs]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
      <div role="tablist" aria-label="资产详情信息" className="flex gap-0 overflow-x-auto border-b border-slate-100 bg-slate-50 px-2">
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
                ? "text-slate-900"
                : "text-slate-500 hover:text-slate-900",
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count ? <span className="text-slate-400">{tab.count}</span> : null}
            {active === tab.key ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--primary)]" /> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="bg-white">
        {active === "technical" ? (
          <AssetTechnicalPanel symbol={row.yfinanceSymbol || row.symbol} currency={row.currency} />
        ) : null}
        {active === "news" ? <AssetNewsList symbol={row.symbol} /> : null}
        {active === "agent" ? <AgentViewPanel assetKey={row.assetKey} /> : null}
        {active === "orders" ? <AssetOrderHistoryPanel symbol={row.symbol} /> : null}
      </div>
    </div>
  );
}
