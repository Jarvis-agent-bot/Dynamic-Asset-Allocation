"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Formatter, NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Loader2 } from "lucide-react";
import { DaaSurfacePanel, DaaSurfaceMiniStat, daaSurfaceSubtlePanelClassName } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatPercent, formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";

const COLORS = [
  "hsl(188 95% 60%)",
  "hsl(45 93% 55%)",
  "hsl(142 71% 45%)",
  "hsl(225 73% 60%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
  "hsl(200 80% 50%)",
  "hsl(30 90% 55%)",
];

type AllocationItem = { name: string; value: number; weightPct: number };
type WeightChange = { name: string; beforePct: number; afterPct: number; changePct: number };

type WhatIfData = {
  baseCurrency: string;
  selectedCount: number;
  before: AllocationItem[];
  after: AllocationItem[];
  totalBuy: number;
  totalSell: number;
  weightChanges: WeightChange[];
};

function toTooltipNumber(value: ValueType | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

export type WhatIfPreviewProps = {
  cycleId: string | null;
  selectedProposalKeys: string[];
  baseCurrency: string;
  embedded?: boolean;
};

function PreviewFrame(props: {
  embedded?: boolean;
  subtitle: string;
  children: ReactNode;
}) {
  if (!props.embedded) {
    return (
      <DaaSurfacePanel accent="indigo" title="执行后组合预览" subtitle={props.subtitle}>
        {props.children}
      </DaaSurfacePanel>
    );
  }

  return (
    <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-4")}>
      <div className="mb-3">
        <div className="text-sm font-semibold text-[var(--text)]">执行后组合预览</div>
        <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{props.subtitle}</div>
      </div>
      {props.children}
    </div>
  );
}

export function WhatIfPreview(props: WhatIfPreviewProps) {
  const [data, setData] = useState<WhatIfData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!props.cycleId || props.selectedProposalKeys.length === 0) {
      setData(null);
      return;
    }

    setLoading(true);
    fetch("/api/daa/workbench/rebalance/what-if", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cycleId: props.cycleId,
        selectedProposalKeys: props.selectedProposalKeys,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j?.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [props.cycleId, props.selectedProposalKeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (props.selectedProposalKeys.length === 0) return null;

  if (loading || !data) {
    return (
      <PreviewFrame embedded={props.embedded} subtitle={loading ? "计算中..." : "暂无数据"}>
        {loading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" /></div> : null}
      </PreviewFrame>
    );
  }

  const valueFormatter: Formatter<ValueType, NameType> = (value) => [formatCurrency(toTooltipNumber(value), data.baseCurrency), "市值"];
  const visibleWeightChanges = data.weightChanges.filter((row) => Math.abs(row.changePct) >= 0.05);

  const renderPie = (items: AllocationItem[], title: string) => (
    <div className="text-center">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">{title}</div>
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={items} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" stroke="none">
            {items.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(222 47% 11%)", border: "1px solid hsla(215,16%,57%,0.2)", borderRadius: 8, fontSize: 11 }}
            formatter={valueFormatter}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <PreviewFrame embedded={props.embedded} subtitle={`已选 ${data.selectedCount} 条建议`}>
      <div className="flex flex-wrap items-center justify-center gap-6">
        {renderPie(data.before, "当前组合")}
        {renderPie(data.after, "执行后预测")}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <DaaSurfaceMiniStat label="预计买入" value={formatCurrency(data.totalBuy, data.baseCurrency)} tone="green" />
        <DaaSurfaceMiniStat label="预计卖出" value={formatCurrency(data.totalSell, data.baseCurrency)} tone="red" />
      </div>

      {visibleWeightChanges.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">权重变化</div>
          {visibleWeightChanges.map((w) => (
            <div key={w.name} className="flex items-center justify-between text-[var(--muted)]">
              <span>{w.name}</span>
              <span className="font-[var(--font-mono)]">
                {formatPercent(w.beforePct)} → {formatPercent(w.afterPct)}
                <span className={w.changePct >= 0 ? "ml-1 text-emerald-400" : "ml-1 text-red-400"}>
                  ({w.changePct >= 0 ? "+" : ""}{w.changePct.toFixed(1)}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </PreviewFrame>
  );
}
