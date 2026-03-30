"use client";

import { useEffect, useState } from "react";
import {
  DaaSurfaceMiniStat,
  DaaSurfacePanel,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import { cn } from "@/lib/utils";
import type {
  PortfolioRiskMetrics,
  StressTestResult,
} from "@/src/core/riskMetrics";

interface RiskMetricsReadModel {
  baseCurrency: string;
  portfolio: {
    totalEquity: number;
    cash: number;
    holdingsValue: number;
  };
  positions: Array<{
    symbol: string;
    market: string;
    qty: number;
    price: number;
    currency: string;
    assetClass: string;
  }>;
  riskMetrics: PortfolioRiskMetrics | null;
  stressTests: StressTestResult[];
  warnings: string[];
  generatedAt: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data: T;
}

function getRiskTone(
  metricName: string,
  value: number,
): "green" | "amber" | "red" {
  if (metricName === "sharpeRatio") {
    if (value >= 1.5) return "green";
    if (value >= 0.8) return "amber";
    return "red";
  }
  if (metricName === "maxDrawdown") {
    if (value <= 10) return "green";
    if (value <= 20) return "amber";
    return "red";
  }
  if (metricName === "annualizedVolatility") {
    if (value <= 15) return "green";
    if (value <= 25) return "amber";
    return "red";
  }
  return "amber";
}

function CorrelationHeatmap({
  matrix,
  symbols,
}: {
  matrix: number[][];
  symbols: string[];
}) {
  if (!matrix || matrix.length === 0 || !symbols || symbols.length === 0) {
    return (
      <div className="text-xs text-[var(--muted)] py-4">
        暂无相关性数据
      </div>
    );
  }

  const cellSize = Math.max(24, Math.min(40, 300 / symbols.length));

  // 相关性颜色映射：-1 (深蓝) -> 0 (白) -> +1 (红)
  const getHeatmapColor = (corr: number): string => {
    if (corr >= 0) {
      // 正相关：白 -> 红
      const intensity = Math.min(1, corr);
      const r = Math.round(255);
      const g = Math.round(200 - intensity * 50);
      const b = Math.round(200 - intensity * 50);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // 负相关：白 -> 深蓝
      const intensity = Math.min(1, -corr);
      const r = Math.round(200 - intensity * 100);
      const g = Math.round(220 - intensity * 50);
      const b = Math.round(255);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex">
        {/* 行标签 + 网格 */}
        <div>
          {/* 空角落 */}
          <div style={{ width: cellSize * 0.8, height: cellSize * 0.8 }} />
          {/* 符号列标签 */}
          {symbols.map((sym) => (
            <div
              key={sym}
              className="flex items-center justify-center text-[10px] font-medium text-[var(--faint)]"
              style={{
                width: cellSize * 0.8,
                height: cellSize * 0.8,
                wordBreak: "break-word",
              }}
            >
              {sym}
            </div>
          ))}
        </div>

        {/* 热力图矩阵 */}
        {symbols.map((rowSym, i) => (
          <div key={rowSym}>
            {/* 行标签 */}
            <div
              className="flex items-center justify-center text-[10px] font-medium text-[var(--faint)]"
              style={{
                width: cellSize,
                height: cellSize * 0.8,
              }}
            >
              {rowSym}
            </div>
            {/* 矩阵单元 */}
            {symbols.map((colSym, j) => {
              const corr = matrix[i]?.[j] ?? 0;
              const isHighCorr = Math.abs(corr) >= 0.7 && i !== j;

              return (
                <div
                  key={`${i}-${j}`}
                  className={cn(
                    "flex items-center justify-center text-[9px] font-mono text-black transition-all",
                    isHighCorr && "ring-1 ring-offset-1 ring-[var(--amber)]",
                  )}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: getHeatmapColor(corr),
                  }}
                  title={`${rowSym} vs ${colSym}: ${corr.toFixed(2)}`}
                >
                  {i === j ? "1" : corr.toFixed(2)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function StressTestTable({ tests }: { tests: StressTestResult[] }) {
  if (!tests || tests.length === 0) {
    return (
      <div className="text-xs text-[var(--muted)] py-4">
        暂无压力测试数据
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left px-3 py-2 text-[var(--faint)] font-semibold">
              场景
            </th>
            <th className="text-right px-3 py-2 text-[var(--faint)] font-semibold">
              估计损失 (%)
            </th>
            <th className="text-right px-3 py-2 text-[var(--faint)] font-semibold">
              估计损失金额
            </th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => {
            const isLoss = test.estimatedLoss < -0.01;
            const tone = isLoss ? "text-red-400" : "text-emerald-400";

            return (
              <tr
                key={test.scenario}
                className="border-b border-[var(--border)]/50"
              >
                <td className="px-3 py-2.5 text-[var(--text)] font-medium">
                  {test.scenarioZh}
                </td>
                <td className={cn("text-right px-3 py-2.5 font-mono", tone)}>
                  {formatPercent(test.estimatedLoss * 100)}
                </td>
                <td className={cn("text-right px-3 py-2.5 font-mono", tone)}>
                  {test.estimatedLossAmount < 0 ? "-" : ""}$
                  {Math.abs(test.estimatedLossAmount).toLocaleString(
                    "en-US",
                    { maximumFractionDigits: 0 },
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PortfolioRiskDashboard() {
  const [readModel, setReadModel] = useState<RiskMetricsReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/daa/read/risk-metrics");
        if (!res.ok) throw new Error("风险指标获取失败");
        const json = (await res.json()) as ApiResponse<RiskMetricsReadModel>;
        if (!json.ok || !json.data) throw new Error("风险指标获取失败");
        setReadModel(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <DaaSurfacePanel
        title="组合风险仪表板"
        subtitle="波动率、风险调整收益、压力测试"
        accent="amber"
      >
        <SkeletonChart height={320} />
      </DaaSurfacePanel>
    );
  }

  if (error) {
    return (
      <DashboardErrorNotice
        title="风险指标加载失败"
        description={error}
      />
    );
  }

  if (!readModel || !readModel.riskMetrics) {
    return (
      <DashboardErrorNotice
        title="风险指标"
        description="暂无风险数据，请先建立持仓"
      />
    );
  }

  const m = readModel.riskMetrics;

  return (
    <DaaSurfacePanel
      title="组合风险仪表板"
      subtitle="波动率、风险调整收益、压力测试与相关性分析"
      accent="amber"
    >
      <div className="space-y-6">
        {/* Section A: Risk Overview - 4 key metrics */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)] mb-3">
            核心风险指标
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DaaSurfaceMiniStat
              label="年化波动率"
              value={`${m.annualizedVolatility.toFixed(1)}%`}
              hint={`日度 ${m.dailyVolatility.toFixed(2)}%`}
              tone={getRiskTone("annualizedVolatility", m.annualizedVolatility)}
            />
            <DaaSurfaceMiniStat
              label="Sharpe 比率"
              value={m.sharpeRatio.toFixed(2)}
              hint={m.sharpeRatio >= 0.8 ? "风险调整收益良好" : "需改进"}
              tone={getRiskTone("sharpeRatio", m.sharpeRatio)}
            />
            <DaaSurfaceMiniStat
              label="最大回撤"
              value={`${m.maxDrawdown.toFixed(1)}%`}
              hint={`当前 ${m.currentDrawdown.toFixed(1)}%`}
              tone={getRiskTone("maxDrawdown", m.maxDrawdown)}
            />
            <DaaSurfaceMiniStat
              label="VaR 95%"
              value={`${m.varHistorical95.toFixed(1)}%`}
              hint={`CVaR ${m.cvar95.toFixed(1)}%`}
              tone="amber"
            />
          </div>
        </div>

        {/* Section B: Additional Metrics - compact inline */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)] mb-3">
            扩展指标
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5")}>
              <div className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
                Sortino
              </div>
              <div className="mt-1.5 font-mono text-sm text-[var(--text)]">
                {m.sortinoRatio.toFixed(2)}
              </div>
            </div>
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5")}>
              <div className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
                Calmar
              </div>
              <div className="mt-1.5 font-mono text-sm text-[var(--text)]">
                {m.calmarRatio.toFixed(2)}
              </div>
            </div>
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5")}>
              <div className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
                HHI 集中度
              </div>
              <div className="mt-1.5 font-mono text-sm text-[var(--text)]">
                {m.hhi.toFixed(4)}
              </div>
            </div>
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5")}>
              <div className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
                Top 3 集中
              </div>
              <div className="mt-1.5 font-mono text-sm text-[var(--text)]">
                {m.top3Concentration.toFixed(1)}%
              </div>
            </div>
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5")}>
              <div className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
                平均相关系数
              </div>
              <div className="mt-1.5 font-mono text-sm text-[var(--text)]">
                {m.avgPairwiseCorrelation.toFixed(3)}
              </div>
            </div>
          </div>
        </div>

        {/* Section C: Correlation Heatmap - Note: correlationMatrix not in API response */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)] mb-3">
            相关性分析
          </div>
          <div className={cn(daaSurfaceSubtlePanelClassName, "p-4")}>
            {m.highCorrelationPairs && m.highCorrelationPairs.length > 0 ? (
              <div className="text-xs">
                <div className="text-[var(--faint)] font-semibold mb-2">
                  高相关对 (≥ 0.7):
                </div>
                <div className="space-y-1">
                  {m.highCorrelationPairs.slice(0, 5).map((pair) => (
                    <div
                      key={`${pair.a}-${pair.b}`}
                      className="text-[var(--muted)]"
                    >
                      {pair.a} ↔ {pair.b}: {pair.corr.toFixed(3)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--muted)] py-4">
                暂无数据
              </div>
            )}
          </div>
        </div>

        {/* Section D: Stress Tests */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)] mb-3">
            压力测试（5 个场景）
          </div>
          <div className={cn(daaSurfaceSubtlePanelClassName, "p-4")}>
            <StressTestTable tests={readModel.stressTests} />
          </div>
        </div>
      </div>
    </DaaSurfacePanel>
  );
}
