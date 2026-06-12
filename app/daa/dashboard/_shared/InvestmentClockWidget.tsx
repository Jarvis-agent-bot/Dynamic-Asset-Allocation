"use client";

import { cn } from "@/lib/utils";

type InvestmentClockPhase = "recovery" | "overheating" | "stagflation" | "deflation";

type InvestmentClockWidgetProps = {
  phase: InvestmentClockPhase | null;
  growthProxy?: number;
  inflationProxy?: number;
  confidence?: number;
};

const QUADRANTS: Array<{
  phase: InvestmentClockPhase;
  label: string;
  assets: string;
  growthDir: string;
  inflationDir: string;
  activeClassName: string;
  position: string;
}> = [
  {
    phase: "recovery",
    label: "复苏",
    assets: "股票, 周期品",
    growthDir: "高增长",
    inflationDir: "低通胀",
    activeClassName: "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]",
    position: "rounded-tl-[var(--radius-lg)]",
  },
  {
    phase: "overheating",
    label: "过热",
    assets: "大宗商品, TIPS",
    growthDir: "高增长",
    inflationDir: "高通胀",
    activeClassName: "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]",
    position: "rounded-tr-[var(--radius-lg)]",
  },
  {
    phase: "deflation",
    label: "衰退",
    assets: "债券, 防御股",
    growthDir: "低增长",
    inflationDir: "低通胀",
    activeClassName: "border-[var(--indigo-border)] bg-[var(--indigo-bg)] text-[var(--indigo)]",
    position: "rounded-bl-[var(--radius-lg)]",
  },
  {
    phase: "stagflation",
    label: "滞胀",
    assets: "现金, 黄金",
    growthDir: "低增长",
    inflationDir: "高通胀",
    activeClassName: "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]",
    position: "rounded-br-[var(--radius-lg)]",
  },
];

export function InvestmentClockWidget({ phase, growthProxy, inflationProxy, confidence }: InvestmentClockWidgetProps) {
  const noData = phase === null;

  return (
    <div className="space-y-2">
      {/* 轴标签 + 网格 */}
      <div className="flex items-stretch gap-2">
        {/* 左侧纵轴标签 */}
        <div className="flex w-5 shrink-0 flex-col items-center justify-center gap-1">
          <span className="whitespace-nowrap text-[10px] font-semibold tracking-normal text-[var(--muted)] [writing-mode:vertical-lr] [text-orientation:mixed] rotate-180">
            增长 ↑
          </span>
          {growthProxy != null ? (
            <span className="mt-1 text-[9px] font-medium tabular-nums text-[var(--faint)]">
              {growthProxy.toFixed(1)}
            </span>
          ) : null}
        </div>

        {/* 2x2 网格 */}
        <div className="grid flex-1 grid-cols-2 gap-0.5">
          {QUADRANTS.map((quadrant) => {
            const isActive = !noData && phase === quadrant.phase;
            return (
              <div
                key={quadrant.phase}
                className={cn(
                  "flex flex-col items-center justify-center border px-3 py-4 text-center transition-colors",
                  quadrant.position,
                  isActive
                    ? quadrant.activeClassName
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
                )}
              >
                <div className={cn("text-sm font-bold", isActive ? "text-current" : "text-[var(--text)]")}>
                  {quadrant.label}
                </div>
                <div className={cn("mt-1 text-[11px]", isActive ? "opacity-90" : "text-[var(--faint)]")}>
                  {quadrant.assets}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部横轴标签 */}
      <div className="flex items-center pl-7">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--muted)]">
            <span>低通胀</span>
            <span>通胀 →</span>
            <span>高通胀</span>
          </div>
          {inflationProxy != null ? (
            <div className="text-center text-[9px] font-medium tabular-nums text-[var(--faint)]">
              通胀指数: {inflationProxy.toFixed(1)}
            </div>
          ) : null}
        </div>
      </div>

      {/* 无数据提示 */}
      {noData ? (
        <div className="pt-1 text-center text-xs text-[var(--faint)]">数据不足</div>
      ) : confidence !== undefined ? (
        <div className="pt-1 text-center text-xs text-[var(--faint)]">
          置信度 {confidence.toFixed(0)}%
        </div>
      ) : null}
    </div>
  );
}
