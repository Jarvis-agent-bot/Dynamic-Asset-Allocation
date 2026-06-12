"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Formatter, NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Loader2 } from "lucide-react";
import { DaaSurfacePanel, daaSurfaceSubtlePanelClassName } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatPercent, formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { daaChartTooltipContentStyle, daaChartTooltipItemStyle, daaChartTooltipLabelStyle } from "@/app/daa/dashboard/_shared/chartTooltipStyles";
import { cn } from "@/lib/utils";

const ALLOCATION_SLICE_COLORS = [
  "var(--primary)",
  "var(--success)",
  "var(--indigo)",
  "var(--amber)",
  "var(--danger)",
  "var(--muted)",
  "var(--primary-border)",
  "var(--success-border)",
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
      <DaaSurfacePanel accent="info" title="执行后组合预览" subtitle={props.subtitle}>
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
  const [allocationPreview, setAllocationPreview] = useState<WhatIfData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!props.cycleId || props.selectedProposalKeys.length === 0) {
      setAllocationPreview(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch("/api/daa/workbench/rebalance/what-if", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        cycleId: props.cycleId,
        selectedProposalKeys: props.selectedProposalKeys,
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((jsonPayload) => setAllocationPreview(jsonPayload?.data ?? null))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAllocationPreview(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [props.cycleId, props.selectedProposalKeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (props.selectedProposalKeys.length === 0) return null;

  if (loading || !allocationPreview) {
    return (
      <PreviewFrame embedded={props.embedded} subtitle={loading ? "计算中..." : "暂无数据"}>
        {loading ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
            <span>正在计算执行后组合...</span>
          </div>
        ) : null}
      </PreviewFrame>
    );
  }

  const valueFormatter: Formatter<ValueType, NameType> = (value) => [formatCurrency(toTooltipNumber(value), allocationPreview.baseCurrency), "市值"];
  const visibleWeightChanges = allocationPreview.weightChanges.filter((row) => Math.abs(row.changePct) >= 0.05);

  const renderPie = (items: AllocationItem[], title: string) => (
    <div className="min-w-[150px]">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">{title}</div>
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={items} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" stroke="none">
            {items.map((allocationItem, index) => (
              <Cell key={allocationItem.name} fill={ALLOCATION_SLICE_COLORS[index % ALLOCATION_SLICE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ ...daaChartTooltipContentStyle, fontSize: 11 }}
            itemStyle={daaChartTooltipItemStyle}
            labelStyle={daaChartTooltipLabelStyle}
            formatter={valueFormatter}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <PreviewFrame embedded={props.embedded} subtitle={`已选 ${allocationPreview.selectedCount} 条建议`}>
      <div className="grid gap-4 sm:grid-cols-[150px_150px_minmax(0,1fr)] sm:items-start">
        {renderPie(allocationPreview.before, "当前组合")}
        {renderPie(allocationPreview.after, "执行后预测")}
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--elevated)] bg-[var(--surface)] sm:grid-cols-1 [&>*:last-child]:border-b-0">
          <TradeFlowSummary
            label="预计买入"
            value={formatCurrency(allocationPreview.totalBuy, allocationPreview.baseCurrency)}
            tone="success"
          />
          <TradeFlowSummary
            label="预计卖出"
            value={formatCurrency(allocationPreview.totalSell, allocationPreview.baseCurrency)}
            tone="danger"
          />
        </div>
      </div>

      {visibleWeightChanges.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs">
          <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">权重变化</div>
          {visibleWeightChanges.map((weightChange) => (
            <div key={weightChange.name} className="flex items-center justify-between text-[var(--muted)]">
              <span>{weightChange.name}</span>
              <span className="font-[var(--font-mono)]">
                {formatPercent(weightChange.beforePct)} → {formatPercent(weightChange.afterPct)}
                <span className={weightChange.changePct >= 0 ? "ml-1 text-[var(--success)]" : "ml-1 text-[var(--danger)]"}>
                  ({weightChange.changePct >= 0 ? "+" : ""}{weightChange.changePct.toFixed(1)}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </PreviewFrame>
  );
}

function TradeFlowSummary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "danger";
}) {
  return (
    <div className="border-b border-[var(--elevated)] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">{label}</div>
      <div className={cn("mt-1 font-[var(--font-mono)] text-sm leading-5", tone === "success" ? "text-[var(--success)]" : "text-[var(--danger)]")}>
        {value}
      </div>
    </div>
  );
}
