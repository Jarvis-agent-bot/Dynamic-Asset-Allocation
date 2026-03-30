"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  DaaSurfacePanel,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

type FxExposureData = {
  currency: string;
  amount: number;
  pct: number;
};

const CURRENCY_COLORS: Record<string, string> = {
  USD: "#38BDF8",
  HKD: "#34D399",
  CNY: "#F87171",
  EUR: "#818CF8",
  JPY: "#F6AD55",
  GBP: "#A78BFA",
  AUD: "#06B6D4",
  SGD: "#10B981",
  CAD: "#8B5CF6",
  CHF: "#EC4899",
};

export function FxExposurePanel(props: {
  bootstrap: WorkbenchBootstrap;
}) {
  const fxExposure = useMemo(() => {
    const exposure = new Map<string, number>();
    let totalValue = 0;

    // Sum up valuations by currency
    for (const row of props.bootstrap.assetUniverse) {
      if (!row.holdingQty || row.holdingQty <= 0) continue;
      const value = row.valuationBase ?? 0;
      if (value <= 0) continue;

      const curr = row.currency || "USD";
      exposure.set(curr, (exposure.get(curr) ?? 0) + value);
      totalValue += value;
    }

    if (totalValue === 0) return [];

    // Convert to percentage and sort by amount
    const data: FxExposureData[] = Array.from(exposure.entries())
      .map(([currency, amount]) => ({
        currency,
        amount,
        pct: (amount / totalValue) * 100,
      }))
      .sort((a, b) => b.amount - a.amount);

    return data;
  }, [props.bootstrap.assetUniverse]);

  if (fxExposure.length === 0) {
    return null;
  }

  // If only one currency, no need for FX exposure panel
  if (fxExposure.length === 1) {
    return null;
  }

  const chartData = fxExposure.map((item) => ({
    name: item.currency,
    value: item.amount,
  }));

  const totalHoldingsValue = fxExposure.reduce((sum, item) => sum + item.amount, 0);

  return (
    <DaaSurfacePanel
      accent="slate"
      title="汇率敞口"
      subtitle={`持仓总额 ${formatCurrency(totalHoldingsValue, props.bootstrap.baseCurrency)}`}
    >
      <div className="space-y-4">
        {/* Mini Pie Chart */}
        <div className="flex justify-center">
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={55}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry) => (
                  <Cell
                    key={`cell-${entry.name}`}
                    fill={CURRENCY_COLORS[entry.name] || "#94A3B8"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Currency Breakdown */}
        <div className="space-y-2">
          {fxExposure.map((item) => (
            <div key={item.currency} className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5 flex items-center justify-between")}>
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CURRENCY_COLORS[item.currency] || "#94A3B8" }}
                />
                <span className="text-xs font-mono text-[var(--text)] font-semibold">{item.currency}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--muted)]">{formatPercent(item.pct / 100)}</span>
                <span className="text-xs font-mono text-[var(--text)]">{formatCurrency(item.amount, props.bootstrap.baseCurrency)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* FX Risk Note */}
        {fxExposure.length > 1 && (
          <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2 text-xs text-[var(--muted)]")}>
            当前组合涉及 {fxExposure.length} 种货币，未进行汇率对冲。{
              fxExposure.some((item) => item.pct > 30)
                ? "建议关注主要货币对的汇率波动。"
                : "汇率风险相对分散。"
            }
          </div>
        )}
      </div>
    </DaaSurfacePanel>
  );
}
