"use client";

import Link from "next/link";
import { BarChart3, ChevronDown, ChevronUp, FlaskConical, Gauge, RefreshCcw, RotateCcw, SlidersHorizontal, Target, TrendingUp } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency, formatDateRangeV1, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardEmptyStateV1 } from "@/app/daa/dashboard/_components/DashboardFeedbackV1";
import {
  DeepLedgerActionButton,
  DeepLedgerEmptyState,
  DeepLedgerFilterChip,
  DeepLedgerMetricCard,
  DeepLedgerMiniStat,
  DeepLedgerNoticeBox,
  DeepLedgerPageHeader,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  deepLedgerDenseFieldClassName,
  deepLedgerSubtlePanelClassName,
  deepLedgerTableShellClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import type { StrategyLabModelV1 } from "@/app/daa/dashboard/_hooks/useStrategyLabModelV1";
import type { StrategyLabEnsembleConfigV1 } from "@/src/daa/modules/strategyLab/strategyLabTypesV1";

const STRATEGY_STYLE_META_V1: Record<keyof StrategyLabEnsembleConfigV1, { label: string; description: string }> = {
  momentum: { label: "趋势进攻", description: "更偏向强者恒强的配置。" },
  riskParity: { label: "风险平衡", description: "用波动平衡风险暴露。" },
  minVariance: { label: "低波防守", description: "更强调回撤控制。" },
  equalWeight: { label: "均衡基线", description: "不带偏见的对照组。" },
};

function formatPercent01V1(value: number, digits = 2): string {
  return formatPercent((Number(value) || 0) * 100, digits);
}

function formatSignedPercentV1(value: number, digits = 2): string {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) <= 1e-8) return formatPercent(0, digits);
  return `${numeric > 0 ? "+" : "-"}${formatPercent(Math.abs(numeric), digits)}`;
}

function formatSharePctV1(value: number, digits = 0): string {
  return `${((Number(value) || 0) * 100).toFixed(digits)}%`;
}

function chartRowsV1(model: StrategyLabModelV1) {
  const candidate = model.selectedCandidate;
  const benchmark = model.result?.benchmark;
  if (!candidate || !benchmark) return [];
  const dates = candidate.backtest.dates || [];
  return dates.map((date, index) => ({
    date: date.slice(5),
    candidate: candidate.backtest.equity[index],
    benchmark: benchmark.equity[index],
  }));
}

export function ResearchFrameBlockV1({ model }: { model: StrategyLabModelV1 }) {
  return (
    <div className={deepLedgerSubtlePanelClassName + " p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <BarChart3 className="h-4 w-4 text-[var(--primary)]" />
            研究框架
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">先固定区间、基准、对齐方式和起始资金，这四项决定这一轮比较是否可解释。</div>
        </div>
        <button
          type="button"
          aria-label={model.showResearchFrame ? "收起研究框架" : "展开研究框架"}
          aria-expanded={model.showResearchFrame}
          onClick={() => model.setShowResearchFrame((value: boolean) => !value)}
          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
        >
          {model.showResearchFrame ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {model.showResearchFrame ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">起始日期</div>
            <input className={deepLedgerDenseFieldClassName} type="date" value={model.startDate} onChange={(e) => model.setStartDate(e.target.value)} />
          </label>
          <label className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">结束日期</div>
            <input className={deepLedgerDenseFieldClassName} type="date" value={model.endDate} onChange={(e) => model.setEndDate(e.target.value)} />
          </label>
          <label className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">基准</div>
            <input className={deepLedgerDenseFieldClassName} value={model.benchmarkSymbol} onChange={(e) => model.setBenchmarkSymbol(e.target.value.toUpperCase())} />
          </label>
          <label className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">基准币种</div>
            <input className={deepLedgerDenseFieldClassName} value={model.baseCurrency} onChange={(e) => model.setBaseCurrency(e.target.value.toUpperCase())} />
          </label>
          <label className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">对齐方式</div>
            <select className={deepLedgerDenseFieldClassName} value={model.alignmentMode} onChange={(e) => model.setAlignmentMode(e.target.value as StrategyLabModelV1["alignmentMode"])}>
              <option value="intersection">公共交易日</option>
              <option value="ffill_union">并集前值填充</option>
            </select>
          </label>
          <label className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">最少样本</div>
            <input className={deepLedgerDenseFieldClassName} type="number" min={30} step={10} value={model.minBars} onChange={(e) => model.setMinBars(Math.max(30, Number(e.target.value) || 0))} />
          </label>
          <label className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">回看窗口</div>
            <input className={deepLedgerDenseFieldClassName} type="number" min={30} step={10} value={model.lookbackBars} onChange={(e) => model.setLookbackBars(Math.max(30, Number(e.target.value) || 0))} />
          </label>
          <label className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">起始资金</div>
            <input className={deepLedgerDenseFieldClassName} type="number" min={1000} step={1000} value={model.initialEquity} onChange={(e) => model.setInitialEquity(Math.max(1000, Number(e.target.value) || 0))} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function AdvancedSettingsBlockV1({ model }: { model: StrategyLabModelV1 }) {
  return (
    <div className={deepLedgerSubtlePanelClassName + " p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <SlidersHorizontal className="h-4 w-4 text-[var(--primary)]" />
            高级设置
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">把执行摩擦、仓位上限、漂移阈值和组合风格明确写出来，结果才知道是在比“研究能力”还是比“可执行性”。</div>
        </div>
        <div className="flex items-center gap-2">
          <DeepLedgerActionButton tone="slate" onClick={model.resetAdvancedExecutionSettings} disabled={!model.systemDefaults || model.usingSystemExecutionDefaults}>
            <RotateCcw className="h-4 w-4" />
            恢复默认
          </DeepLedgerActionButton>
          <button
            type="button"
            aria-label={model.showAdvancedSettings ? "收起高级设置" : "展开高级设置"}
            aria-expanded={model.showAdvancedSettings}
            onClick={() => model.setShowAdvancedSettings((value: boolean) => !value)}
            className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
          >
            {model.showAdvancedSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {model.showAdvancedSettings ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2"><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">费用率 (bps)</div><input className={deepLedgerDenseFieldClassName} type="number" min={0} step={0.1} value={model.feeRateBps} onChange={(e) => model.setFeeRateBps(Math.max(0, Number(e.target.value) || 0))} /></label>
            <label className="space-y-2"><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">滑点 (bps)</div><input className={deepLedgerDenseFieldClassName} type="number" min={0} step={1} value={model.slippageBps} onChange={(e) => model.setSlippageBps(Math.max(0, Number(e.target.value) || 0))} /></label>
            <label className="space-y-2"><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">仓位上限</div><input className={deepLedgerDenseFieldClassName} type="number" min={0} max={1} step={0.05} value={model.constraints.maxPositionPct} onChange={(e) => model.setConstraints((prev) => ({ ...prev, maxPositionPct: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }))} /></label>
            <label className="space-y-2"><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">最小成交额</div><input className={deepLedgerDenseFieldClassName} type="number" min={0} step={50} value={model.constraints.minNotional} onChange={(e) => model.setConstraints((prev) => ({ ...prev, minNotional: Math.max(0, Number(e.target.value) || 0) }))} /></label>
            <label className="space-y-2"><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">单笔 NAV 上限</div><input className={deepLedgerDenseFieldClassName} type="number" min={0} max={1} step={0.01} value={model.constraints.maxOrderPctOfNav} onChange={(e) => model.setConstraints((prev) => ({ ...prev, maxOrderPctOfNav: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }))} /></label>
            <label className="space-y-2"><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">漂移阈值</div><input className={deepLedgerDenseFieldClassName} type="number" min={0} step={0.01} value={model.policy.thresholdPct} onChange={(e) => model.setPolicy((prev) => ({ ...prev, thresholdPct: Math.max(0, Number(e.target.value) || 0) }))} /></label>
            <label className="space-y-2"><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">策略最小调仓额</div><input className={deepLedgerDenseFieldClassName} type="number" min={0} step={50} value={model.policy.minTradeNotional} onChange={(e) => model.setPolicy((prev) => ({ ...prev, minTradeNotional: Math.max(0, Number(e.target.value) || 0) }))} /></label>
            <label className="space-y-2"><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">冷却时间（小时）</div><input className={deepLedgerDenseFieldClassName} type="number" min={0} step={1} value={Math.round(model.policy.cooldownSeconds / 3600)} onChange={(e) => model.setPolicy((prev) => ({ ...prev, cooldownSeconds: Math.max(0, Number(e.target.value) || 0) * 3600 }))} /></label>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {model.normalizedEnsembleRows.map((row) => {
              const key = row.key as keyof StrategyLabEnsembleConfigV1;
              const meta = STRATEGY_STYLE_META_V1[key];
              return (
                <div key={row.key} className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.55)] p-3">
                  <div className="text-sm font-semibold text-[var(--text)]">{meta.label}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{meta.description}</div>
                  <input
                    className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--border)]"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={row.rawValue}
                    onChange={(e) => model.setEnsembleConfig((prev) => ({ ...prev, [row.key]: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>输入 {Number(row.rawValue).toFixed(2)}</span>
                    <span>归一后 {formatSharePctV1(row.normalizedValue)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function AssetPickerBlockV1({ model }: { model: StrategyLabModelV1 }) {
  return (
    <div className={deepLedgerSubtlePanelClassName + " p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Target className="h-4 w-4 text-[var(--primary)]" />
            资产池与研究目标
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">选研究范围时只影响本轮实验；研究目标权重默认跟随工作台，也可以单独覆写。</div>
        </div>
        <div className="flex items-center gap-2">
          <DeepLedgerActionButton tone="slate" onClick={model.resetResearchTargetWeights}>恢复工作台目标</DeepLedgerActionButton>
          <DeepLedgerActionButton tone="slate" onClick={model.applyEqualResearchTargetWeights} disabled={model.selectedAssetCount <= 0}>平均分配</DeepLedgerActionButton>
          <button
            type="button"
            aria-label={model.showAssetPicker ? "收起资产池与研究目标" : "展开资产池与研究目标"}
            aria-expanded={model.showAssetPicker}
            onClick={() => model.setShowAssetPicker((value: boolean) => !value)}
            className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
          >
            {model.showAssetPicker ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {model.showAssetPicker ? (
        <div className={`mt-4 overflow-x-auto ${deepLedgerTableShellClassName}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-left text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
                <th className="px-4 py-3">选中</th>
                <th className="px-4 py-3">资产</th>
                <th className="px-4 py-3">现持仓</th>
                <th className="px-4 py-3">工作台目标</th>
                <th className="px-4 py-3">研究目标</th>
              </tr>
            </thead>
            <tbody>
              {model.targetComparisonRows.length > 0 ? model.targetComparisonRows.map((row) => (
                <tr key={row.assetKey} className="border-b border-[var(--border)]/70">
                  <td className="px-4 py-3"><input type="checkbox" checked={row.selected} onChange={() => model.toggleAsset(row.assetKey)} /></td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[var(--text)]">{row.symbol}</div>
                    <div className="text-xs text-[var(--muted)]">{row.market} · {row.currency}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{row.holdingQty > 0 ? `${row.holdingQty.toFixed(2)} 股 / ${formatPercent(row.actualWeightPct)}` : "未持有"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{formatPercent(row.targetWeightPct)}</td>
                  <td className="px-4 py-3">
                    <input className={deepLedgerDenseFieldClassName + " w-24"} type="number" min={0} max={100} step={0.1} value={row.researchTargetWeightPct} onChange={(e) => model.setResearchTargetWeightPct(row.assetKey, Number(e.target.value) || 0)} />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <DashboardEmptyStateV1
                      title="当前没有可研究资产"
                      description="先到工作台把资产加入观察列表，或补充至少一个带行情标识的持仓；准备好后，这里会自动出现研究资产清单。"
                      className="border-0 bg-transparent px-0 py-2 text-left"
                      action={(
                        <div className="flex flex-wrap gap-2">
                          <Link href="/daa/dashboard/workbench?tab=discovery" className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--text)]">去资产发现</Link>
                          <Link href="/daa/dashboard/workbench?tab=watchlist" className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--text)]">去观察列表</Link>
                        </div>
                      )}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function StrategyLabSetupPanelV1({ model }: { model: StrategyLabModelV1 }) {
  return (
    <>
      <DeepLedgerPageHeader
        title="策略实验室"
        description="先准备研究输入，再比较候选方案，最后决定是否把结果写回正式目标。"
        actions={(
          <div className="flex flex-wrap gap-2">
            <DeepLedgerActionButton onClick={() => void model.reloadSeed(true, true)} disabled={model.refreshingContext || model.loadingContext}>
              <RefreshCcw className={`h-4 w-4 ${model.refreshingContext || model.loadingContext ? "animate-spin" : ""}`} />
              {model.refreshingContext || model.loadingContext ? "同步上下文…" : "刷新上下文"}
            </DeepLedgerActionButton>
            <DeepLedgerActionButton data-testid="strategy-lab-run-button" tone="primary" onClick={() => void model.handleRun()} disabled={!model.canRun}>
              <FlaskConical className={`h-4 w-4 ${model.running ? "animate-pulse" : ""}`} />
              {model.running ? "运行中…" : "运行策略实验"}
            </DeepLedgerActionButton>
          </div>
        )}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DeepLedgerMetricCard label="实验资产" value={String(model.selectedAssetCount)} subLabel={`其中持仓 ${model.selectedHoldingCount} 个`} accent="cyan" />
        <DeepLedgerMetricCard label="研究目标和" value={formatPercent(model.selectedTargetSumPct)} subLabel={model.researchTargetOverrideActive ? `已覆写 ${model.changedResearchTargetCount} 个目标` : `跟随工作台目标 ${formatPercent(model.workbenchSelectedTargetSumPct)}`} accent="indigo" />
        <DeepLedgerMetricCard label="起始资金" value={formatCurrency(model.initialEquity, model.baseCurrency)} subLabel={`基准币 ${model.baseCurrency}`} accent="amber" />
        <DeepLedgerMetricCard label="样本窗口" value={formatDateRangeV1(model.startDate, model.endDate)} subLabel={`${model.alignmentMode === "intersection" ? "公共交易日" : "并集前值填充"} · 回看 ${model.lookbackBars} 个周期`} accent="green" />
      </div>

      {model.contextError ? (
        <DeepLedgerNoticeBox tone="red" title="初始化数据加载失败" description={model.contextError} />
      ) : null}

      {model.preflightChecks.length > 0 ? (
        <DeepLedgerNoticeBox
          tone={model.blockingPreflightChecks.length > 0 ? "red" : "amber"}
          title={model.blockingPreflightChecks.length > 0 ? "运行前需要先修正这些问题" : "运行前提示"}
          description="先确保样本可比较、可成交，再运行回测，结果才更可靠。"
        >
          <ul className="space-y-2 pl-4 text-sm text-[var(--muted)]">
            {model.preflightChecks.map((item) => <li key={`${item.severity}-${item.message}`} className="list-disc">{item.message}</li>)}
          </ul>
        </DeepLedgerNoticeBox>
      ) : null}

      <DeepLedgerPanel accent="cyan" title="先定义这轮实验" subtitle="先定义样本区间、执行约束和研究资产，保证本轮比较公平且可落地。">
        <div className="space-y-4">
          <ResearchFrameBlockV1 model={model} />
          <AdvancedSettingsBlockV1 model={model} />
          <AssetPickerBlockV1 model={model} />
        </div>
      </DeepLedgerPanel>
    </>
  );
}

export function StrategyLabRunOverviewPanelV1({ model }: { model: StrategyLabModelV1 }) {
  if (!model.result || !model.selectedScenario) return null;
  const rows = chartRowsV1(model);
  return (
    <DeepLedgerPanel
      accent="green"
      title="运行总览"
      subtitle="对比不同场景与候选方案，确认哪组结果最值得落地。"
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <DeepLedgerActionButton tone="slate" onClick={() => model.setShowEquityChart((value: boolean) => !value)}>
            <TrendingUp className="h-4 w-4" />
            {model.showEquityChart ? "隐藏曲线" : "显示曲线"}
          </DeepLedgerActionButton>
          <DeepLedgerActionButton data-testid="strategy-lab-writeback-button" tone="primary" onClick={() => void model.handleWriteback()} disabled={!model.canWriteback}>
            <Target className="h-4 w-4" />
            {model.writingBack ? "写回中…" : "写回目标权重"}
          </DeepLedgerActionButton>
        </div>
      )}
    >
      {model.resultIsStale ? (
        <div className="mb-4 rounded-[14px] border border-[rgba(246,173,85,0.24)] bg-[rgba(246,173,85,0.12)] px-4 py-3 text-sm text-[var(--amber)]">
          当前结果已不是这套输入的最新输出，请重新运行后再写回。
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {model.result.scenarios.map((scenario) => (
          <DeepLedgerFilterChip key={scenario.scenarioId} active={model.selectedScenarioId === scenario.scenarioId} onClick={() => model.setSelectedScenarioId(scenario.scenarioId)}>
            {scenario.label}
          </DeepLedgerFilterChip>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DeepLedgerMiniStat label="当前候选" value={model.selectedCandidate?.label || "-"} hint={`最佳候选 ${model.selectedScenario.bestCandidateId || "-"}`} tone="green" />
        <DeepLedgerMiniStat label="总收益" value={formatPercent01V1(model.selectedCandidate?.backtest.metrics.totalReturn || 0)} hint={`vs ${model.result.benchmark.symbol} ${formatPercent01V1(model.selectedCandidate?.attribution.activeReturn || 0)}`} tone="cyan" />
        <DeepLedgerMiniStat label="Sharpe / MDD" value={`${(model.selectedCandidate?.backtest.metrics.sharpe || 0).toFixed(2)} / ${formatPercent01V1(model.selectedCandidate?.backtest.metrics.maxDrawdown || 0)}`} hint={`胜率 ${formatPercent01V1(model.selectedCandidate?.backtest.metrics.winRate || 0)}`} tone="indigo" />
        <DeepLedgerMiniStat label="换手 / 再平衡" value={`${formatCurrency(model.selectedCandidate?.backtest.summary.turnoverNotional || 0, model.baseCurrency)}`} hint={`${model.selectedCandidate?.backtest.summary.rebalanceCount || 0} 次事件`} tone="amber" />
      </div>

      {model.resultReadiness ? (
        <div className="mt-4">
          <DeepLedgerNoticeBox tone={model.resultReadiness.tone} title={model.resultReadiness.title} description={model.resultReadiness.description} icon={<Gauge className="h-4 w-4" />}>
            <ul className="space-y-2 pl-4 text-sm text-[var(--muted)]">
              {model.resultReadiness.items.map((item) => <li key={item} className="list-disc">{item}</li>)}
            </ul>
          </DeepLedgerNoticeBox>
        </div>
      ) : null}

      {model.showEquityChart && rows.length > 0 ? (
        <div className="mt-4 rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.6)] p-4">
          <LineChart width={900} height={280} data={rows} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 16 }} />
            <Legend />
            <Line type="monotone" dataKey="candidate" name={model.selectedCandidate?.label || "候选"} stroke="#38BDF8" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="benchmark" name={model.result.benchmark.symbol} stroke="#94A3B8" dot={false} strokeWidth={1.8} />
          </LineChart>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {model.selectedScenario.candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => model.setSelectedCandidateId(candidate.id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${model.selectedCandidateId === candidate.id ? "border-[var(--primary)]/40 bg-[rgba(56,189,248,0.12)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"}`}
          >
            {candidate.label} · {formatPercent01V1(candidate.backtest.metrics.totalReturn)}
          </button>
        ))}
      </div>
    </DeepLedgerPanel>
  );
}

export function StrategyLabCandidateDetailPanelV1({ model }: { model: StrategyLabModelV1 }) {
  if (!model.result || !model.selectedCandidate) return null;
  return (
    <DeepLedgerPanel accent="indigo" title="候选详情" subtitle="这里固定展示当前候选的收益、风险、执行差异和目标权重变化。">
      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <DeepLedgerMiniStat label="执行差异" value={model.executionGapMeta?.displayValue || "-"} hint={model.executionGapMeta?.label || "等待比较"} tone={model.executionGapMeta?.tone || "slate"} />
            <DeepLedgerMiniStat label="排名变化" value={model.selectedCandidateRankMeta?.displayValue || "-"} hint={model.selectedCandidateRankMeta?.label || "等待比较"} tone={model.selectedCandidateRankMeta?.tone || "slate"} />
            <DeepLedgerMiniStat label="主动收益" value={formatPercent01V1(model.selectedCandidate.attribution.activeReturn)} hint={`基准 ${model.result.benchmark.symbol}`} tone="cyan" />
            <DeepLedgerMiniStat label="波动 / Calmar" value={`${formatPercent01V1(model.selectedCandidate.attribution.metrics.volatility)} / ${model.selectedCandidate.attribution.metrics.calmar.toFixed(2)}`} hint={`MDD ${formatPercent01V1(model.selectedCandidate.attribution.metrics.maxDrawdown)}`} tone="amber" />
          </div>
          {model.warningSummary.length > 0 ? (
            <DeepLedgerNoticeBox tone="amber" title="运行警告" description="这些提示不会阻止结果生成，但会影响可解释性和可执行性；最小成交额相关明细已按资产与原因折叠。">
              <ul className="space-y-2 pl-4 text-sm text-[var(--muted)]">
                {model.warningSummary.map((item) => <li key={item} className="list-disc">{item}</li>)}
              </ul>
            </DeepLedgerNoticeBox>
          ) : null}
        </div>

        <div className={`overflow-x-auto ${deepLedgerTableShellClassName}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-left text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
                <th className="px-4 py-3">资产</th>
                <th className="px-4 py-3">当前目标</th>
                <th className="px-4 py-3">候选目标</th>
                <th className="px-4 py-3">变化</th>
              </tr>
            </thead>
            <tbody>
              {model.selectedDiffRows.map((row) => (
                <tr key={row.symbol} className="border-b border-[var(--border)]/70">
                  <td className="px-4 py-3 font-semibold text-[var(--text)]">{row.symbol}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{formatPercent01V1(row.currentWeight)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{formatPercent01V1(row.nextWeight)}</td>
                  <td className="px-4 py-3 text-[var(--text)]">{formatSignedPercentV1(row.deltaWeight * 100)}</td>
                </tr>
              ))}
              {model.selectedDiffRows.length <= 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--faint)]">当前候选与现有目标没有显著差异。</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </DeepLedgerPanel>
  );
}

export function StrategyLabDeepAnalysisPanelV1({ model }: { model: StrategyLabModelV1 }) {
  if (!model.result || !model.selectedCandidate) return null;
  return (
    <DeepLedgerPanel
      accent="amber"
      title="深度分析"
      subtitle="把收益贡献、再平衡事件与样本诊断集中展示，便于判断结果是否稳健。"
      action={(
        <DeepLedgerActionButton tone="slate" aria-expanded={model.showDeepAnalysis} onClick={() => model.setShowDeepAnalysis((value: boolean) => !value)}>
          {model.showDeepAnalysis ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {model.showDeepAnalysis ? "收起" : "展开"}
        </DeepLedgerActionButton>
      )}
    >
      {model.showDeepAnalysis ? (
        <div className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
          <div className="space-y-4">
            <DeepLedgerNoticeBox tone="cyan" title="资产贡献" description="按收益贡献排序，先看收益来自哪些资产。">
              <div className="space-y-2">
                {model.topContributors.length > 0 ? model.topContributors.map((row: StrategyLabModelV1["topContributors"][number]) => (
                  <div key={row.symbol} className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.55)] px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text)]">{model.assetLabelByKey.get(row.symbol) || row.symbol}</div>
                      <div className="text-xs text-[var(--muted)]">平均权重 {formatPercent01V1(row.avgWeight)} · 资产收益 {formatPercent01V1(row.assetReturn)}</div>
                    </div>
                    <div className="text-sm font-semibold text-[var(--text)]">{formatPercent01V1(row.contributionToReturn)}</div>
                  </div>
                )) : <DashboardEmptyStateV1 title="暂无资产贡献" description="当前结果还没有贡献拆解，通常是样本不足或本轮结果尚未生成明细。" className="border-0 bg-transparent px-0 py-4 text-left" />}
              </div>
            </DeepLedgerNoticeBox>
            <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3 font-[var(--font-mono)] text-xs leading-6 text-[var(--muted)]">
              <div>输入资产 {model.result.diagnostics.inputSymbolCount} / 输出资产 {model.result.diagnostics.outputSymbolCount}</div>
              <div>并集日期 {model.result.diagnostics.unionDateCount} / 公共日期 {model.result.diagnostics.commonDateCount}</div>
              <div>样本区间 {model.result.diagnostics.startDate || "-"} ~ {model.result.diagnostics.endDate || "-"}</div>
              <div>基准 {model.result.benchmark.symbol} / 对齐模式 {model.result.diagnostics.mode === "intersection" ? "公共交易日" : model.result.diagnostics.mode === "ffill_union" ? "并集前值填充" : model.result.diagnostics.mode}</div>
            </div>
          </div>
          <div>
            <DeepLedgerNoticeBox tone="amber" title="再平衡事件" description="快速看调仓频率、换手和信号是否过于密集。">
              <div className="space-y-2">
                {model.selectedCandidate.attribution.rebalanceEvents.length > 0 ? model.selectedCandidate.attribution.rebalanceEvents.slice(0, 8).map((event) => (
                  <div key={`${event.date}-${event.turnover}`} className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.55)] px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text)]">{event.date}</div>
                      <div className="text-xs text-[var(--muted)]">调仓前最大偏离 {formatPercent01V1(event.driftBefore, 2)}</div>
                    </div>
                    <div className="text-sm text-[var(--text)]">{formatCurrency(event.turnover, model.baseCurrency)}</div>
                  </div>
                )) : <div className="text-sm text-[var(--muted)]">没有触发再平衡事件。</div>}
              </div>
            </DeepLedgerNoticeBox>
          </div>
        </div>
      ) : null}
    </DeepLedgerPanel>
  );
}

export function StrategyLabEmptyStatePanelV1({ model }: { model: StrategyLabModelV1 }) {
  return (
    <DeepLedgerEmptyState
      title="还没有回测结果"
      description={model.selectedAssetCount <= 0 || model.selectedTargetSumPct <= 0
        ? "先准备研究资产，并给本轮实验设置参考权重；这些调整只影响本次实验，不会自动改正式配置。"
        : "先选研究范围，再调组合风格并运行；系统会生成理想/可执行两个场景，并支持把候选权重写回工作台。"}
      action={(
        <div className="flex flex-wrap justify-center gap-2">
          {model.selectedAssetCount <= 0 ? <Link href="/daa/dashboard/workbench?tab=discovery" className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--text)]">去资产发现</Link> : null}
          {model.selectedTargetSumPct <= 0 ? <Link href="/daa/dashboard/workbench?tab=watchlist" className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--text)]">去观察列表看正式目标</Link> : null}
          <DeepLedgerActionButton tone="primary" onClick={() => void model.handleRun()} disabled={!model.canRun}>
            <FlaskConical className="h-4 w-4" />
            运行第一轮实验
          </DeepLedgerActionButton>
        </div>
      )}
    />
  );
}
