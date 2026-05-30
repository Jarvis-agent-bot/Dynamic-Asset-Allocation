"use client";

import { AlertTriangle, Info } from "lucide-react";

import {
  DaaSurfaceMetricCard,
  DaaSurfaceNoticeBox,
  DaaSurfacePanel,
  daaSurfaceTableCellClassName,
  daaSurfaceTableHeadClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { StrategyLabRunResult } from "@/src/daa/modules/strategyLab/strategyLabTypes";
import { StrategyLabEquityChart } from "./StrategyLabEquityChart";
import { strategyLabel, type UseStrategyLabResult } from "./useStrategyLab";
import type { StrategyLabWarningPresentation } from "./strategyLabWarningPresentation";

interface StrategyLabResultsViewProps {
  state: UseStrategyLabResult;
}

export function StrategyLabResultsView({ state }: StrategyLabResultsViewProps) {
  const { result, strategyResults, benchmarkResults, chartData, warningSummary } = state;
  if (!result) return null;

  return (
    <>
      <MergedWarningsPanel summary={warningSummary} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DaaSurfaceMetricCard
          label="总收益"
          value={`${(result.metrics.totalReturn * 100).toFixed(2)}%`}
          subLabel={`年化 ${(result.metrics.annualizedReturn * 100).toFixed(2)}% · 夏普 ${result.attribution.metrics.sharpe.toFixed(2)}`}
          accent={result.metrics.totalReturn >= 0 ? "green" : "red"}
        />
        <DaaSurfaceMetricCard
          label="最大回撤"
          value={`${(result.attribution.metrics.maxDrawdown * 100).toFixed(2)}%`}
          subLabel={`年化波动率 ${(result.attribution.metrics.volatility * 100).toFixed(2)}%`}
          accent="amber"
        />
        <DaaSurfaceMetricCard
          label="Calmar 比率"
          value={result.attribution.metrics.calmar.toFixed(2)}
          subLabel={`胜率 ${(result.attribution.metrics.winRate * 100).toFixed(1)}%`}
          accent="indigo"
        />
      </div>

      {strategyResults.length > 1 ? <StrategyComparisonTable result={result} /> : null}

      <StrategyLabEquityChart
        chartData={chartData}
        strategyResults={strategyResults}
        benchmarkResults={benchmarkResults}
      />

      {result.attribution.perAsset.length > 0 ? <AttributionPanel result={result} /> : null}

      {result.attribution.rebalanceEvents.length > 0 ? <RebalanceEventsPanel result={result} /> : null}
    </>
  );
}

function MergedWarningsPanel({ summary }: { summary: StrategyLabWarningPresentation }) {
  const groups: Array<{ key: string; title: string; tone: "slate" | "amber"; items: string[]; icon: React.ReactNode }> = [];
  if (summary.valuationNotes.length > 0) {
    groups.push({
      key: "valuation",
      title: "估值口径",
      tone: "slate",
      items: summary.valuationNotes,
      icon: <Info className="h-4 w-4" />,
    });
  }
  const orderItems = [...summary.orderWarnings, ...summary.orderNotes];
  if (orderItems.length > 0) {
    groups.push({
      key: "order",
      title: "下单约束",
      tone: summary.orderWarnings.length > 0 ? "amber" : "slate",
      items: orderItems,
      icon: summary.orderWarnings.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />,
    });
  }
  if (summary.otherWarnings.length > 0) {
    groups.push({
      key: "other",
      title: "回测提醒",
      tone: "amber",
      items: summary.otherWarnings,
      icon: <AlertTriangle className="h-4 w-4" />,
    });
  }
  if (groups.length === 0) return null;

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);
  const hasWarning = groups.some((g) => g.tone === "amber");

  return (
    <DaaSurfaceNoticeBox
      tone={hasWarning ? "amber" : "slate"}
      title={`回测说明 · ${totalItems} 项`}
      icon={hasWarning ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
    >
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
              {g.icon}
              {g.title}
              <span className="text-[10px] font-normal text-[var(--faint)]">{g.items.length}</span>
            </div>
            <ul className="list-inside list-disc space-y-1 pl-1 text-xs text-[var(--muted)]">
              {g.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </DaaSurfaceNoticeBox>
  );
}

function StrategyComparisonTable({ result }: { result: StrategyLabRunResult }) {
  return (
    <DaaSurfacePanel accent="slate" title="策略对比" subtitle="同一资产池、同一区间下的多策略回测结果。">
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]">
        <table className="w-full border-collapse bg-[var(--surface)]">
          <thead>
            <tr>
              <th className={daaSurfaceTableHeadClassName}>策略</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>总收益</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>夏普</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>最大回撤</th>
              <th className={`${daaSurfaceTableHeadClassName} text-right`}>胜率</th>
            </tr>
          </thead>
          <tbody>
            {result.strategyResults.map((item) => (
              <tr key={item.strategy}>
                <td className={`${daaSurfaceTableCellClassName} text-[var(--text)]`}>{strategyLabel(item.strategy)}</td>
                <td
                  className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)]`}
                  style={{ color: item.metrics.totalReturn >= 0 ? "var(--success)" : "var(--danger)" }}
                >
                  {item.metrics.totalReturn >= 0 ? "+" : ""}{(item.metrics.totalReturn * 100).toFixed(2)}%
                </td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--text)]`}>
                  {item.metrics.sharpe.toFixed(2)}
                </td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>
                  {(item.metrics.maxDrawdown * 100).toFixed(2)}%
                </td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>
                  {(item.metrics.winRate * 100).toFixed(1)}%
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
    <DaaSurfacePanel accent="indigo" title="资产归因" subtitle="各资产对组合收益的贡献明细。">
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]">
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
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)]`} style={{ color: item.assetReturn >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {item.assetReturn >= 0 ? "+" : ""}{(item.assetReturn * 100).toFixed(2)}%
                </td>
                <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)]`} style={{ color: item.contributionToReturn >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {item.contributionToReturn >= 0 ? "+" : ""}{(item.contributionToReturn * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.attribution.benchmark.return != null ? (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[var(--faint)]">基准 ({result.attribution.benchmark.symbol})</span>
            <span className="font-[var(--font-mono)] text-[var(--text)]">
              {(result.attribution.benchmark.return * 100).toFixed(2)}%
            </span>
            {result.attribution.activeReturn != null ? (
              <>
                <span className="text-[var(--faint)]">超额收益</span>
                <span
                  className="font-[var(--font-mono)]"
                  style={{ color: result.attribution.activeReturn >= 0 ? "var(--success)" : "var(--danger)" }}
                >
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
    <DaaSurfacePanel accent="amber" title="再平衡事件" subtitle="回测期间触发的再平衡记录。">
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]">
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
