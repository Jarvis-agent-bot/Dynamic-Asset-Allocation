"use client";

import { useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  DaaSurfaceActionButton,
  DaaSurfacePanel,
  DaaSurfaceMiniStat,
  DaaSurfaceNoticeBox,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { PortfolioTemplateDialog } from "./PortfolioTemplateDialog";
import { formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";

const COLORS = [
  "hsl(188 95% 60%)", // cyan
  "hsl(45 93% 55%)", // amber
  "hsl(142 71% 45%)", // green
  "hsl(225 73% 60%)", // indigo
  "hsl(0 84% 60%)", // red
  "hsl(280 65% 60%)", // purple
  "hsl(200 80% 50%)", // blue
  "hsl(30 90% 55%)", // orange
];

type AssetRow = {
  assetKey: string;
  symbol: string;
  targetWeightHint: number;
  watchEnabled: boolean;
};

export function TargetWeightSummary(props: {
  rows: AssetRow[];
  onTemplateApplied?: () => void | Promise<void>;
}) {
  const [templateOpen, setTemplateOpen] = useState(false);

  const basketRows = useMemo(
    () => props.rows.filter((r) => r.watchEnabled && r.targetWeightHint > 0),
    [props.rows],
  );

  // targetWeightHint 是 0~1 小数形式，需要 ×100 转为百分比
  const totalWeight = useMemo(
    () => basketRows.reduce((sum, r) => sum + r.targetWeightHint * 100, 0),
    [basketRows],
  );

  const pieData = useMemo(() => {
    const items = basketRows.map((r) => ({
      name: r.symbol,
      value: r.targetWeightHint * 100,
    }));
    const remaining = 100 - totalWeight;
    if (remaining > 0.5) {
      items.push({ name: "现金/未分配", value: remaining });
    }
    return items;
  }, [basketRows, totalWeight]);

  if (basketRows.length === 0) return null;

  // Determine progress bar color
  const progressTone =
    totalWeight > 100.5
      ? "red"
      : totalWeight >= 95
        ? "green"
        : totalWeight >= 80
          ? "amber"
          : "red";

  const progressColor =
    progressTone === "green"
      ? "hsl(142 71% 45%)"
      : progressTone === "amber"
        ? "hsl(45 93% 55%)"
        : "hsl(0 84% 60%)";

  return (
    <DaaSurfacePanel
      accent="cyan"
      title="目标配置概览"
      subtitle={`${basketRows.length} 个标的已设权重`}
      action={
        <DaaSurfaceActionButton tone="slate" onClick={() => setTemplateOpen(true)}>
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
          <div className="grid grid-cols-3 gap-2">
            <DaaSurfaceMiniStat
              label="已配置标的"
              value={String(basketRows.length)}
              tone="cyan"
            />
            <DaaSurfaceMiniStat
              label="权重总和"
              value={formatPercent(totalWeight)}
              tone={progressTone}
            />
            <DaaSurfaceMiniStat
              label="现金隐含占比"
              value={
                totalWeight < 100
                  ? formatPercent(100 - totalWeight)
                  : "0%"
              }
              tone="slate"
            />
          </div>

          {/* Progress bar */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-[var(--faint)]">权重分配进度</span>
              <span style={{ color: progressColor }} className="font-medium">
                {formatPercent(totalWeight)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(totalWeight, 100)}%`,
                  backgroundColor: progressColor,
                }}
              />
            </div>
          </div>

          {totalWeight > 100.5 && (
            <DaaSurfaceNoticeBox
              tone="red"
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
                {pieData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={COLORS[i % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(222 47% 11%)",
                  border: "1px solid hsla(215,16%,57%,0.2)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: number) => [`${value.toFixed(1)}%`, "权重"]) as any}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border)] pt-3">
        {pieData.map((item, i) => (
          <div
            key={item.name}
            className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {item.name} {item.value.toFixed(1)}%
          </div>
        ))}
      </div>
    </DaaSurfacePanel>
  );
}
