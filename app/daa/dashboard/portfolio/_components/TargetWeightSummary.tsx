"use client";

import { useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Formatter, NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { daaChartTooltipContentStyle, daaChartTooltipItemStyle, daaChartTooltipLabelStyle } from "@/app/daa/dashboard/_shared/chartTooltipStyles";
import {
  DaaSurfaceActionButton,
  DaaSurfacePanel,
  DaaSurfaceNoticeBox,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { PortfolioTemplateDialog } from "./PortfolioTemplateDialog";
import { formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";

const TARGET_WEIGHT_SLICE_COLORS = [
  "var(--primary)",
  "var(--amber)",
  "var(--success)",
  "var(--indigo)",
  "var(--danger)",
  "var(--muted)",
  "var(--amber-border)",
  "var(--success-border)",
];

type AssetRow = {
  assetKey: string;
  symbol: string;
  name?: string | null;
  displayNameZh?: string | null;
  targetWeightHint: number;
  targetWeightPct: number;
  watchEnabled: boolean;
};

export type TargetWeightSummaryProps = {
  rows: AssetRow[];
  onTemplateApplied?: () => void | Promise<void>;
};

function toTooltipNumber(value: ValueType | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

function targetWeightSliceClass(sliceIndex: number): string {
  return [
    "bg-[var(--primary)]",
    "bg-[var(--amber)]",
    "bg-[var(--success)]",
    "bg-[var(--indigo)]",
    "bg-[var(--danger)]",
    "bg-[var(--muted)]",
    "bg-[var(--amber-border)]",
    "bg-[var(--success-border)]",
  ][sliceIndex % TARGET_WEIGHT_SLICE_COLORS.length];
}

export function TargetWeightSummary(props: TargetWeightSummaryProps) {
  const [templateOpen, setTemplateOpen] = useState(false);

  const basketRows = useMemo(
    () => props.rows.filter((assetRow) => assetRow.watchEnabled && assetRow.targetWeightPct > 0),
    [props.rows],
  );

  const totalWeight = useMemo(
    () => basketRows.reduce((sum, assetRow) => sum + assetRow.targetWeightPct, 0),
    [basketRows],
  );

  const pieData = useMemo(() => {
    const items = basketRows.map((assetRow) => ({
      name: assetRow.displayNameZh || assetRow.name || assetRow.symbol,
      value: assetRow.targetWeightPct,
    }));
    const remaining = 100 - totalWeight;
    if (remaining > 0.5) {
      items.push({ name: "现金/未分配", value: remaining });
    }
    return items;
  }, [basketRows, totalWeight]);

  if (basketRows.length === 0) return null;

  // 有效目标权重汇总后用颜色提示配置完整度与越界风险。
  const progressTone =
    totalWeight > 100.5
      ? "danger"
      : totalWeight >= 95
        ? "success"
        : totalWeight >= 80
          ? "warning"
          : "danger";

  const progressTextClass = progressTone === "success"
    ? "text-[var(--success)]"
    : progressTone === "warning"
      ? "text-[var(--amber)]"
      : "text-[var(--danger)]";
  const progressBarClass = progressTone === "success"
    ? "[&::-webkit-progress-value]:bg-[var(--success)] [&::-moz-progress-bar]:bg-[var(--success)] accent-[var(--success)]"
    : progressTone === "warning"
      ? "[&::-webkit-progress-value]:bg-[var(--amber)] [&::-moz-progress-bar]:bg-[var(--amber)] accent-[var(--amber)]"
      : "[&::-webkit-progress-value]:bg-[var(--danger)] [&::-moz-progress-bar]:bg-[var(--danger)] accent-[var(--danger)]";
  const tooltipFormatter: Formatter<ValueType, NameType> = (value) => [`${toTooltipNumber(value).toFixed(1)}%`, "权重"];

  return (
    <DaaSurfacePanel
      accent="primary"
      title="目标配置概览"
      subtitle={`${basketRows.length} 个标的已设权重`}
      action={
        <DaaSurfaceActionButton tone="neutral" onClick={() => setTemplateOpen(true)}>
          <LayoutGrid className="h-3.5 w-3.5" />
          应用模板
        </DaaSurfaceActionButton>
      }
    >
      <PortfolioTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onApplied={props.onTemplateApplied}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
        {/* Left: Stats + Progress Bar */}
        <div className="space-y-3">
          <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-3">
            <div className="border-b border-[var(--border)] px-3 py-2 sm:border-b-0 sm:border-r">
              <div className="text-[10px] text-[var(--muted)]">已配置标的</div>
              <div className="mt-1 font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
                {basketRows.length}
              </div>
            </div>
            <div className="border-b border-[var(--border)] px-3 py-2 sm:border-b-0 sm:border-r">
              <div className="text-[10px] text-[var(--muted)]">权重总和</div>
              <div className={cn("mt-1 font-[var(--font-mono)] text-sm font-semibold", progressTextClass)}>
                {formatPercent(totalWeight)}
              </div>
            </div>
            <div className="px-3 py-2">
              <div className="text-[10px] text-[var(--muted)]">现金隐含占比</div>
              <div className="mt-1 font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
                {totalWeight < 100 ? formatPercent(100 - totalWeight) : "0%"}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-[var(--faint)]">权重分配进度</span>
              <span className={cn("font-medium", progressTextClass)}>
                {formatPercent(totalWeight)}
              </span>
            </div>
            <progress
              value={Math.min(totalWeight, 100)}
              max={100}
              className={cn(
                "block h-2 w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--elevated)] [&::-webkit-progress-bar]:bg-[var(--elevated)] [&::-webkit-progress-value]:transition-all",
                progressBarClass,
              )}
            />
          </div>

          {totalWeight > 100.5 && (
            <DaaSurfaceNoticeBox
              tone="danger"
              title="权重总和超过 100%"
              description={`当前总和 ${formatPercent(totalWeight)}，请调整各标的权重使总和不超过 100%。`}
            />
          )}
        </div>

        {/* Right: Pie chart */}
        <div className="flex items-center justify-center">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((_, sliceIndex) => (
                  <Cell
                    key={sliceIndex}
                    fill={TARGET_WEIGHT_SLICE_COLORS[sliceIndex % TARGET_WEIGHT_SLICE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ ...daaChartTooltipContentStyle, fontSize: 12 }}
                itemStyle={daaChartTooltipItemStyle}
                labelStyle={daaChartTooltipLabelStyle}
                formatter={tooltipFormatter}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border)] pt-3">
        {pieData.map((item, sliceIndex) => (
          <div
            key={item.name}
            className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
          >
            <span
              className={cn("inline-block h-2 w-2 rounded-[var(--radius-sm)]", targetWeightSliceClass(sliceIndex))}
            />
            {item.name} {item.value.toFixed(1)}%
          </div>
        ))}
      </div>
    </DaaSurfacePanel>
  );
}
