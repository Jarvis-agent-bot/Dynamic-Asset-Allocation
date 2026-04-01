"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { DaaSurfacePanel, DaaSurfaceMiniStat } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatPercent, formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";

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

type HoldingRow = {
  assetKey: string;
  symbol: string;
  holdingQty: number;
  lastPrice: number;
  actualWeightPct: number;
  fxRateToBase: number | null;
};

type Proposal = {
  assetKey: string;
  symbol: string;
  side: "BUY" | "SELL";
  suggestedQty: number;
  price: number;
  selected: boolean;
};

export function WhatIfPreview(props: {
  holdings: HoldingRow[];
  proposals: Proposal[];
  cash: number;
  baseCurrency: string;
}) {
  const { before, after, totalBuy, totalSell } = useMemo(() => {
    const holdMap = new Map(props.holdings.map((h) => [h.assetKey, h]));
    const selectedProposals = props.proposals.filter((p) => p.selected);

    // Current allocation
    const beforeItems: { name: string; value: number }[] = [];
    let totalHoldingsValue = 0;
    for (const h of props.holdings) {
      if (h.holdingQty > 0) {
        const val = h.holdingQty * h.lastPrice * (h.fxRateToBase ?? 1);
        totalHoldingsValue += val;
        beforeItems.push({ name: h.symbol, value: val });
      }
    }
    const beforeTotal = totalHoldingsValue + props.cash;
    if (props.cash > 0) beforeItems.push({ name: "现金", value: props.cash });

    // Projected allocation
    const adjustments = new Map<string, number>();
    let buyTotal = 0;
    let sellTotal = 0;
    for (const p of selectedProposals) {
      const h = holdMap.get(p.assetKey);
      const fx = h?.fxRateToBase ?? 1;
      const delta = p.suggestedQty * p.price * fx;
      if (p.side === "BUY") {
        adjustments.set(p.assetKey, (adjustments.get(p.assetKey) ?? 0) + delta);
        buyTotal += delta;
      } else {
        adjustments.set(p.assetKey, (adjustments.get(p.assetKey) ?? 0) - delta);
        sellTotal += delta;
      }
    }

    const afterItems: { name: string; value: number }[] = [];
    let afterTotalValue = 0;

    for (const h of props.holdings) {
      if (h.holdingQty > 0 || adjustments.has(h.assetKey)) {
        const currentVal = h.holdingQty * h.lastPrice * (h.fxRateToBase ?? 1);
        const adj = adjustments.get(h.assetKey) ?? 0;
        const newVal = Math.max(0, currentVal + adj);
        if (newVal > 0) {
          afterTotalValue += newVal;
          afterItems.push({ name: h.symbol, value: newVal });
        }
        adjustments.delete(h.assetKey);
      }
    }

    // New positions from proposals for assets not currently held
    for (const [assetKey, adj] of adjustments) {
      if (adj > 0) {
        const p = selectedProposals.find((pp) => pp.assetKey === assetKey);
        afterTotalValue += adj;
        afterItems.push({ name: p?.symbol ?? assetKey, value: adj });
      }
    }

    const afterCash = props.cash - buyTotal + sellTotal;
    if (afterCash > 0) {
      afterTotalValue += afterCash;
      afterItems.push({ name: "现金", value: afterCash });
    }

    return {
      before: beforeItems,
      after: afterItems,
      totalBuy: buyTotal,
      totalSell: sellTotal,
    };
  }, [props.holdings, props.proposals, props.cash]);

  const selectedCount = props.proposals.filter((p) => p.selected).length;
  if (selectedCount === 0) return null;

  const renderPie = (data: { name: string; value: number }[], title: string) => (
    <div className="text-center">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">{title}</div>
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" stroke="none">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(222 47% 11%)", border: "1px solid hsla(215,16%,57%,0.2)", borderRadius: 8, fontSize: 11 }}
            formatter={(value: number | undefined, name: string | undefined) => [formatCurrency(value ?? 0, props.baseCurrency), name ?? ""]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <DaaSurfacePanel accent="indigo" title="执行后组合预览" subtitle={`已选 ${selectedCount} 条建议`}>
      <div className="grid grid-cols-2 gap-4">
        {renderPie(before, "当前配置")}
        {renderPie(after, "执行后预测")}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">
        <DaaSurfaceMiniStat label="预计买入" value={formatCurrency(totalBuy, props.baseCurrency)} tone="green" />
        <DaaSurfaceMiniStat label="预计卖出" value={formatCurrency(totalSell, props.baseCurrency)} tone="red" />
      </div>

      {/* Change detail table */}
      {after.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">权重变化</div>
          {after.filter(a => a.name !== "现金").map((a) => {
            const beforeItem = before.find(b => b.name === a.name);
            const beforeTotal = before.reduce((s, b) => s + b.value, 0);
            const afterTotal = after.reduce((s, b) => s + b.value, 0);
            const beforePct = beforeItem ? (beforeItem.value / beforeTotal) * 100 : 0;
            const afterPct = (a.value / afterTotal) * 100;
            const delta = afterPct - beforePct;
            return (
              <div key={a.name} className="flex items-center justify-between text-xs">
                <span className="text-[var(--muted)]">{a.name}</span>
                <span className={delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[var(--muted)]"}>
                  {formatPercent(beforePct)} → {formatPercent(afterPct)}
                  <span className="ml-1 text-[10px]">({delta > 0 ? "+" : ""}{delta.toFixed(1)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </DaaSurfacePanel>
  );
}
