"use client";

import { useState } from "react";
import { AlertTriangle, Info, Loader2, Sparkles } from "lucide-react";

import {
  DaaSurfaceNoticeBox,
  DaaSurfacePanel,
  daaSurfaceTableCellClassName,
  daaSurfaceTableHeadClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { analyzeBacktest } from "@/src/daa/modules/strategyLab/strategyLabApi";
import type { StrategyLabModelAnalysis, StrategyLabRunResult } from "@/src/daa/modules/strategyLab/strategyLabTypes";
import { StrategyLabEquityChart } from "./StrategyLabEquityChart";
import { strategyLabel, type UseStrategyLabResult } from "./useStrategyLab";
import type { StrategyLabWarningPresentation } from "./strategyLabWarningPresentation";

interface StrategyLabResultsViewProps {
  state: UseStrategyLabResult;
}

function StrategySummaryMetric({
  label,
  value,
  subLabel,
  tone = "neutral",
  index,
}: {
  label: string;
  value: string;
  subLabel: string;
  tone?: "success" | "danger" | "warning" | "info" | "neutral";
  index: number;
}) {
  const toneClass = {
    success: "text-[var(--success)]",
    danger: "text-[var(--danger)]",
    warning: "text-[var(--amber)]",
    info: "text-[var(--indigo)]",
    neutral: "text-[var(--text)]",
  }[tone];
  const borderClass = index < 2 ? "border-b border-[var(--border)] md:border-b-0 md:border-r" : "";

  return (
    <div className={`min-w-0 bg-[var(--card)] px-3 py-2.5 ${borderClass}`}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">{label}</div>
      <div className={`mt-1 font-[var(--font-mono)] text-[22px] leading-none ${toneClass}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-[var(--muted)]">{subLabel}</div>
    </div>
  );
}

function signedReturnClassName(value: number | null | undefined): string {
  return (value ?? 0) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]";
}

export function StrategyLabResultsView({ state }: StrategyLabResultsViewProps) {
  const { result, strategyResults, benchmarkResults, chartData, warningSummary } = state;
  if (!result) return null;

  return (
    <>
      <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] md:grid-cols-3">
        <StrategySummaryMetric
          label="总收益"
          value={`${(result.metrics.totalReturn * 100).toFixed(2)}%`}
          subLabel={`年化 ${(result.metrics.annualizedReturn * 100).toFixed(2)}% · 夏普 ${result.attribution.metrics.sharpe.toFixed(2)}`}
          tone={result.metrics.totalReturn >= 0 ? "success" : "danger"}
          index={0}
        />
        <StrategySummaryMetric
          label="最大回撤"
          value={`${(result.attribution.metrics.maxDrawdown * 100).toFixed(2)}%`}
          subLabel={`年化波动率 ${(result.attribution.metrics.volatility * 100).toFixed(2)}%`}
          tone="warning"
          index={1}
        />
        <StrategySummaryMetric
          label="Calmar 比率"
          value={result.attribution.metrics.calmar.toFixed(2)}
          subLabel={`胜率 ${(result.attribution.metrics.winRate * 100).toFixed(1)}%`}
          tone="info"
          index={2}
        />
      </div>

      <BacktestModelAnalysisPanel result={result} />

      {strategyResults.length > 1 || benchmarkResults.length > 0 ? <StrategyComparisonTable result={result} /> : null}

      <StrategyLabEquityChart
        baseCurrency={result.baseCurrency}
        chartData={chartData}
        strategyResults={strategyResults}
        benchmarkResults={benchmarkResults}
      />

      {result.attribution.perAsset.length > 0 ? <AttributionPanel result={result} /> : null}

      {result.attribution.rebalanceEvents.length > 0 ? <RebalanceEventsPanel result={result} /> : null}

      <MergedWarningsPanel summary={warningSummary} />
    </>
  );
}

function MergedWarningsPanel({ summary }: { summary: StrategyLabWarningPresentation }) {
  const groups: Array<{ key: string; title: string; tone: "neutral" | "warning"; items: string[]; icon: React.ReactNode }> = [];
  if (summary.valuationNotes.length > 0) {
    groups.push({
      key: "valuation",
      title: "估值口径",
      tone: "neutral",
      items: summary.valuationNotes,
      icon: <Info className="h-4 w-4" />,
    });
  }
  const orderItems = [...summary.orderWarnings, ...summary.orderNotes];
  if (orderItems.length > 0) {
    groups.push({
      key: "order",
      title: "下单约束",
      tone: summary.orderWarnings.length > 0 ? "warning" : "neutral",
      items: orderItems,
      icon: summary.orderWarnings.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />,
    });
  }
  if (summary.otherWarnings.length > 0) {
    groups.push({
      key: "other",
      title: "回测提醒",
      tone: "warning",
      items: summary.otherWarnings,
      icon: <AlertTriangle className="h-4 w-4" />,
    });
  }
  if (groups.length === 0) return null;

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);
  const hasWarning = groups.some((g) => g.tone === "warning");

  return (
    <DaaSurfaceNoticeBox
      tone={hasWarning ? "warning" : "neutral"}
      title={`回测说明 · ${totalItems} 项`}
      icon={hasWarning ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
    >
      <details className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-[var(--muted)]">
          <span>默认收起详细说明，展开查看估值口径、下单约束和其他提醒。</span>
          <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text)] group-open:hidden">展开</span>
          <span className="hidden shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text)] group-open:inline">收起</span>
        </summary>
        <div className="mt-3 space-y-3">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
              {g.icon}
              {g.title}
              <span className="text-[10px] font-normal text-[var(--faint)]">{g.items.length}</span>
            </div>
            <ul className="list-inside list-disc space-y-1 pl-1 text-xs text-[var(--muted)]">
              {g.items.slice(0, 30).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {g.items.length > 30 ? (
              <div className="mt-1 text-[11px] text-[var(--faint)]">已显示前 30 条，另有 {g.items.length - 30} 条同类说明。</div>
            ) : null}
          </div>
        ))}
        </div>
      </details>
    </DaaSurfaceNoticeBox>
  );
}

function BacktestModelAnalysisPanel({ result }: { result: StrategyLabRunResult }) {
  const [analysis, setAnalysis] = useState<StrategyLabModelAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runAnalysis() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      setAnalysis(await analyzeBacktest(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "模型解读失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DaaSurfacePanel
      accent="primary"
      title="回测解读"
      subtitle="指标、风险和下一步。"
      action={(
        <button
          type="button"
          onClick={() => void runAnalysis()}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {analysis ? "重新分析" : "分析回测结果"}
        </button>
      )}
    >
      {error ? <div className="rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</div> : null}
      {!analysis && !error ? (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          点击上方按钮生成一份面向决策的回测解读。
        </div>
      ) : null}
      {analysis ? (
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] lg:grid-cols-3">
          <ModelAnalysisColumn title="核心结论" items={analysis.summary} />
          <ModelAnalysisColumn title="主要风险" items={analysis.risks} />
          <ModelAnalysisColumn title="下一步建议" items={analysis.suggestions} />
          <div className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--faint)] lg:col-span-3">
            来源：{analysis.source === "llm" ? "LLM 分析" : "本地规则分析"}
          </div>
        </div>
      ) : null}
    </DaaSurfacePanel>
  );
}

function ModelAnalysisColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border-b border-[var(--border)] px-4 py-3 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <div className="mb-2 text-xs font-semibold text-[var(--text)]">{title}</div>
      <ul className="space-y-2 text-xs leading-5 text-[var(--muted)]">
        {items.length > 0 ? items.map((item) => <li key={item}>• {item}</li>) : <li>暂无。</li>}
      </ul>
    </div>
  );
}

function StrategyComparisonTable({ result }: { result: StrategyLabRunResult }) {
  const benchmarkRows = result.benchmarkResults.map((item) => ({
    key: `benchmark-${item.symbol}`,
    name: item.label,
    type: "基准",
    totalReturn: item.return,
    sharpe: null as number | null,
    maxDrawdown: null as number | null,
    winRate: null as number | null,
  }));
  const strategyRows = result.strategyResults.map((item) => ({
    key: `strategy-${item.strategy}`,
    name: strategyLabel(item.strategy),
    type: "策略",
    totalReturn: item.metrics.totalReturn,
    sharpe: item.metrics.sharpe,
    maxDrawdown: item.metrics.maxDrawdown,
    winRate: item.metrics.winRate,
  }));
  const rows = [...strategyRows, ...benchmarkRows];

  return (
    <DaaSurfacePanel accent="neutral" title="策略对比" subtitle="同资产池、同区间。">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
        <table className="w-full border-collapse bg-[var(--surface)]">
          <thead>
            <tr>
              <th className={daaSurfaceTableHeadClassName}>名称</th>
              <th className={daaSurfaceTableHeadClassName}>类型</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>总收益</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>夏普（越高越好）</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>最大回撤</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>胜率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.key}>
                <td className={`${daaSurfaceTableCellClassName} text-[var(--text)]`}>{item.name}</td>
                <td className={`${daaSurfaceTableCellClassName} text-[var(--muted)]`}>{item.type}</td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] ${signedReturnClassName(item.totalReturn)}`}>
                  {item.totalReturn == null ? "-" : `${item.totalReturn >= 0 ? "+" : ""}${(item.totalReturn * 100).toFixed(2)}%`}
                </td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--text)]`}>
                  {item.sharpe == null ? "-" : item.sharpe.toFixed(2)}
                </td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>
                  {item.maxDrawdown == null ? "-" : `${(item.maxDrawdown * 100).toFixed(2)}%`}
                </td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>
                  {item.winRate == null ? "-" : `${(item.winRate * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DaaSurfacePanel>
  );
}

function AttributionPanel({ result }: { result: StrategyLabRunResult }) {
  return (
    <DaaSurfacePanel accent="info" title="资产归因" subtitle="各资产对组合收益的贡献明细。">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
        <table className="w-full border-collapse bg-[var(--surface)]">
          <thead>
            <tr>
              <th className={daaSurfaceTableHeadClassName}>资产</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>平均权重</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>资产收益</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>贡献度</th>
            </tr>
          </thead>
          <tbody>
            {result.attribution.perAsset.map((item) => (
              <tr key={item.symbol}>
                <td className={`${daaSurfaceTableCellClassName} font-[var(--font-mono)] text-[var(--text)]`}>{item.symbol}</td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>{(item.avgWeight * 100).toFixed(1)}%</td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] ${signedReturnClassName(item.assetReturn)}`}>
                  {item.assetReturn >= 0 ? "+" : ""}{(item.assetReturn * 100).toFixed(2)}%
                </td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] ${signedReturnClassName(item.contributionToReturn)}`}>
                  {item.contributionToReturn >= 0 ? "+" : ""}{(item.contributionToReturn * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.attribution.benchmark.return != null ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[var(--faint)]">基准 ({result.attribution.benchmark.symbol})</span>
            <span className="font-[var(--font-mono)] text-[var(--text)]">
              {(result.attribution.benchmark.return * 100).toFixed(2)}%
            </span>
            {result.attribution.activeReturn != null ? (
              <>
                <span className="text-[var(--faint)]">超额收益</span>
                <span className={`font-[var(--font-mono)] ${signedReturnClassName(result.attribution.activeReturn)}`}>
                  {result.attribution.activeReturn >= 0 ? "+" : ""}{(result.attribution.activeReturn * 100).toFixed(2)}%
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </DaaSurfacePanel>
  );
}

function RebalanceEventsPanel({ result }: { result: StrategyLabRunResult }) {
  return (
    <DaaSurfacePanel accent="warning" title="再平衡事件" subtitle="回测期间触发的再平衡记录。">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
        <table className="w-full border-collapse bg-[var(--surface)]">
          <thead>
            <tr>
              <th className={daaSurfaceTableHeadClassName}>日期</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>换手率</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>触发前偏移</th>
            </tr>
          </thead>
          <tbody>
            {result.attribution.rebalanceEvents.map((evt, i) => (
              <tr key={i}>
                <td className={`${daaSurfaceTableCellClassName} font-[var(--font-mono)] text-[var(--text)]`}>{evt.date}</td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>{(evt.turnoverPct * 100).toFixed(2)}%</td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>{(evt.driftBefore * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DaaSurfacePanel>
  );
}
