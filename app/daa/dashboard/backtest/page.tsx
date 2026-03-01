"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Clock, Cpu, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import StatCard from "../_components/StatCard";
import { formatCurrency, formatPercent } from "../_components/daaFormatters";
import { usePositions, useRunHistory, useStrategyConfig } from "../_components/useDaaStore";
import { useMarketDataClient } from "../../useMarketDataClient";

import { computeBacktestAttribution } from "@/src/core/backtest/attribution";
import { backtestDriftRebalance, type DriftRebalanceBacktestResult } from "@/src/core/backtestDriftRebalance";
import {
  buildTargetWeightDiffRowsV1,
  prepareAlignedSeriesBySymbolV1,
  runStrategyLabBacktestsV1,
} from "@/src/daa/modules/strategyLab/strategyLabEngineV1";
import type { StrategyLabEnsembleConfigV1, StrategyLabRunResultV1 } from "@/src/daa/modules/strategyLab/strategyLabTypesV1";

type BacktestState = {
  running: boolean;
  error: string;
  result: DriftRebalanceBacktestResult | null;
  seriesBySymbol: Record<string, Array<{ date: string; close: number }>>;
};

type StrategyLabState = {
  running: boolean;
  error: string;
  success: string;
  result: StrategyLabRunResultV1 | null;
  ignoredSymbols: string[];
  rangeLabel: string;
};

const DEFAULT_ENSEMBLE_CONFIG_V1: StrategyLabEnsembleConfigV1 = {
  momentum: 0.4,
  riskParity: 0.25,
  minVariance: 0.15,
  equalWeight: 0.2,
};

const ENSEMBLE_LABELS_V1: Record<keyof StrategyLabEnsembleConfigV1, string> = {
  momentum: "动量",
  riskParity: "风险平价",
  minVariance: "最小方差",
  equalWeight: "等权",
};

function toRangeLabel(start: string, end: string): string {
  if (!start || !end) return "-";
  return `${start} ~ ${end}`;
}

export default function BacktestPage() {
  const [positions] = usePositions();
  const [config, setConfig] = useStrategyConfig();
  const [runHistoryData] = useRunHistory();
  const marketData = useMarketDataClient();

  const positionsList = positions ?? [];
  const runHistory = runHistoryData ?? [];

  const [backtestDays, setBacktestDays] = useState(60);
  const [optimizationDays, setOptimizationDays] = useState(60);
  const [bt, setBt] = useState<BacktestState>({ running: false, error: "", result: null, seriesBySymbol: {} });
  const [ensembleConfig, setEnsembleConfig] = useState<StrategyLabEnsembleConfigV1>(DEFAULT_ENSEMBLE_CONFIG_V1);
  const [lab, setLab] = useState<StrategyLabState>({
    running: false,
    error: "",
    success: "",
    result: null,
    ignoredSymbols: [],
    rangeLabel: "-",
  });

  const symbols = useMemo(() => {
    const s = new Set<string>();
    for (const p of positionsList) s.add(String(p.symbol || "").trim().toUpperCase());
    for (const sym of Object.keys(config.targetWeights || {})) s.add(String(sym || "").trim().toUpperCase());
    return Array.from(s).filter(Boolean).sort();
  }, [positionsList, config.targetWeights]);

  function buildInitialHoldings(symbolPool: string[]): Record<string, number> | undefined {
    const allowed = new Set(symbolPool);
    const out: Record<string, number> = {};
    for (const p of positionsList) {
      const symbol = String(p.symbol || "").trim().toUpperCase();
      if (!allowed.has(symbol)) continue;
      const qty = Number(p.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      out[symbol] = (out[symbol] || 0) + qty;
    }
    return Object.keys(out).length ? out : undefined;
  }

  async function fetchRawSeries(symbolList: string[], start: string, end: string): Promise<{
    rawSeriesBySymbol: Record<string, Array<{ date: string; close: number }>>;
    ignoredSymbols: string[];
  }> {
    const rawSeriesBySymbol: Record<string, Array<{ date: string; close: number }>> = {};
    const ignoredSymbols: string[] = [];

    await Promise.all(
      symbolList.map(async (symbol) => {
        try {
          const bars = await marketData.yfinance.priceSeriesBars({ symbol, start, end });
          const mapped = bars
            .map((bar: any) => ({
              date: String(bar?.date || "").trim(),
              close: Number(bar?.close),
            }))
            .filter((bar) => Boolean(bar.date) && Number.isFinite(bar.close) && bar.close > 0);

          if (mapped.length >= 2) {
            rawSeriesBySymbol[symbol] = mapped;
            return;
          }
        } catch {
          // ignore per-symbol failures
        }
        ignoredSymbols.push(symbol);
      }),
    );

    return { rawSeriesBySymbol, ignoredSymbols: ignoredSymbols.sort() };
  }

  async function runBacktest() {
    if (bt.running || !symbols.length) return;
    setBt({ running: true, error: "", result: null, seriesBySymbol: {} });

    try {
      const today = new Date();
      const start = new Date(today.getTime() - backtestDays * 86400000).toISOString().slice(0, 10);
      const end = today.toISOString().slice(0, 10);

      const { rawSeriesBySymbol } = await fetchRawSeries(symbols, start, end);
      const seriesBySymbol = prepareAlignedSeriesBySymbolV1(rawSeriesBySymbol);
      const availableSymbols = Object.keys(seriesBySymbol);

      if (availableSymbols.length < 1) {
        setBt({ running: false, error: "无法获取可对齐的历史数据，请减少标的或扩大回测区间。", result: null, seriesBySymbol: {} });
        return;
      }

      const tw: Record<string, number> = {};
      for (const sym of availableSymbols) tw[sym] = Number(config.targetWeights[sym] || 0);
      const twSum = Object.values(tw).reduce((s, v) => s + v, 0);
      if (twSum <= 0) {
        for (const sym of availableSymbols) tw[sym] = 1 / availableSymbols.length;
      }

      const initialHoldings = buildInitialHoldings(availableSymbols);

      const result = backtestDriftRebalance({
        seriesBySymbol,
        targetWeights: tw,
        initialHoldings,
        initialCash: config.account.cash || undefined,
        initialEquity: initialHoldings ? undefined : 10000,
        constraints: {
          maxPositionPct: config.constraints.maxPositionPct,
          minNotional: config.constraints.minNotional,
        },
        policy: {
          thresholdPct: config.policy.baseDriftTriggerPct,
          minTradeNotional: config.constraints.minNotional,
        },
        includeEventStates: true,
        includeTimeline: true,
      });

      setBt({ running: false, error: "", result, seriesBySymbol });
    } catch (e) {
      setBt({ running: false, error: e instanceof Error ? e.message : String(e), result: null, seriesBySymbol: {} });
    }
  }

  function runStrategyLabWithSeries(
    rawSeriesBySymbol: Record<string, Array<{ date: string; close: number }>>,
    rangeLabel: string,
    ignoredSymbols: string[],
  ) {
    const alignedSeriesBySymbol = prepareAlignedSeriesBySymbolV1(rawSeriesBySymbol);
    const alignedSymbols = Object.keys(alignedSeriesBySymbol);

    if (!alignedSymbols.length) {
      setLab((prev) => ({
        ...prev,
        running: false,
        error: "可对齐的历史数据不足（至少需要 2 个共同交易日），请减少标的或扩大回测区间。",
        success: "",
        result: null,
        ignoredSymbols,
        rangeLabel,
      }));
      return;
    }

    try {
      const result = runStrategyLabBacktestsV1({
        seriesBySymbol: alignedSeriesBySymbol,
        baselineTargetWeights: config.targetWeights,
        ensembleConfig,
        initialHoldings: buildInitialHoldings(alignedSymbols),
        initialCash: Number(config.account.cash) || 0,
        initialEquity: 10000,
        constraints: {
          maxPositionPct: config.constraints.maxPositionPct,
          minNotional: config.constraints.minNotional,
        },
        policy: {
          thresholdPct: config.policy.baseDriftTriggerPct,
          minTradeNotional: config.constraints.minNotional,
        },
      });

      setLab((prev) => ({
        ...prev,
        running: false,
        error: "",
        success: "真实回测完成。",
        result,
        ignoredSymbols,
        rangeLabel,
      }));
    } catch (error) {
      setLab((prev) => ({
        ...prev,
        running: false,
        error: error instanceof Error ? error.message : String(error),
        success: "",
        result: null,
        ignoredSymbols,
        rangeLabel,
      }));
    }
  }

  async function runStrategyOptimization() {
    if (lab.running || !symbols.length) return;

    const today = new Date();
    const start = new Date(today.getTime() - optimizationDays * 86400000).toISOString().slice(0, 10);
    const end = today.toISOString().slice(0, 10);
    const rangeLabel = toRangeLabel(start, end);

    setLab((prev) => ({ ...prev, running: true, error: "", success: "" }));

    const { rawSeriesBySymbol, ignoredSymbols } = await fetchRawSeries(symbols, start, end);
    runStrategyLabWithSeries(rawSeriesBySymbol, rangeLabel, ignoredSymbols);
  }

  function rerunStrategyOptimization() {
    if (lab.running || !lab.result) return;
    setLab((prev) => ({ ...prev, running: true, error: "", success: "" }));

    const rawSeriesBySymbol = Object.fromEntries(
      Object.entries(lab.result.seriesBySymbol).map(([symbol, series]) => [
        symbol,
        series.map((bar) => ({ date: bar.date, close: bar.close })),
      ]),
    );

    runStrategyLabWithSeries(rawSeriesBySymbol, lab.rangeLabel, lab.ignoredSymbols);
  }

  function applyEnsembleToConfig() {
    if (!lab.result) return;
    setConfig({
      ...config,
      targetWeights: lab.result.weightsByCandidate.ensemble,
    });
    setLab((prev) => ({ ...prev, success: "优化后的 Ensemble 权重已写回策略配置。" }));
  }

  const equityCurveData = useMemo(() => {
    if (!bt.result) return [];
    return bt.result.dates.map((date, i) => ({
      date,
      returnPct: Number(((bt.result!.equity[i] - 1) * 100).toFixed(2)),
    }));
  }, [bt.result]);

  const eventsData = useMemo(() => {
    if (!bt.result) return [];
    return bt.result.events.filter((e) => e.kind === "rebalance");
  }, [bt.result]);

  const timelineData = useMemo(() => {
    if (!bt.result?.timeline) return [];
    return bt.result.timeline.map((t) => ({
      date: t.date,
      maxDrift: Number((t.trigger.stats.maxAbsDriftPct * 100).toFixed(2)),
      triggered: t.trigger.shouldRebalance,
    }));
  }, [bt.result]);

  const equityHistory = useMemo(() => {
    return runHistory.map((entry) => {
      const r = entry.response as any;
      return {
        ts: new Date(entry.ts).toLocaleDateString(),
        equity: r?.summary?.totalEquity ?? 0,
        orders: r?.summary?.executableOrderCount ?? 0,
        triggered: r?.summary?.shouldRebalance ?? false,
      };
    }).reverse();
  }, [runHistory]);

  const attribution = useMemo(() => {
    if (!bt.result) return null;
    return computeBacktestAttribution({
      backtest: bt.result,
      targetWeights: config.targetWeights,
      seriesBySymbol: bt.seriesBySymbol,
      benchmarkSymbol: "SPY",
    });
  }, [bt.result, bt.seriesBySymbol, config.targetWeights]);

  const baseline = useMemo(() => lab.result?.candidates.find((candidate) => candidate.id === "baseline") || null, [lab.result]);
  const ensemble = useMemo(() => lab.result?.candidates.find((candidate) => candidate.id === "ensemble") || null, [lab.result]);

  const activeReturn = useMemo(() => {
    if (!baseline || !ensemble) return 0;
    return ensemble.backtest.metrics.totalReturn - baseline.backtest.metrics.totalReturn;
  }, [baseline, ensemble]);

  const optimizationCurveData = useMemo(() => {
    if (!baseline || !ensemble) return [];
    const count = Math.min(baseline.backtest.dates.length, ensemble.backtest.dates.length);
    const rows: Array<{ date: string; baseline: number; ensemble: number }> = [];

    for (let i = 0; i < count; i++) {
      rows.push({
        date: baseline.backtest.dates[i],
        baseline: Number(((baseline.backtest.equity[i] - 1) * 100).toFixed(2)),
        ensemble: Number(((ensemble.backtest.equity[i] - 1) * 100).toFixed(2)),
      });
    }

    return rows;
  }, [baseline, ensemble]);

  const diffRows = useMemo(() => {
    if (!lab.result) return [];
    return buildTargetWeightDiffRowsV1(config.targetWeights, lab.result.weightsByCandidate.ensemble);
  }, [config.targetWeights, lab.result]);

  const ensembleAlphaSum = useMemo(
    () => Object.values(ensembleConfig).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [ensembleConfig],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="回测与优化" description="先回测验证当前组合，再在同页完成策略优化与权重写回。" />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">漂移回测</CardTitle>
          <CardDescription>
            拉取 yfinance 历史数据，使用当前策略参数运行 backtestDriftRebalance。
            {symbols.length ? ` 标的: ${symbols.join(", ")}` : " (无标的)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">回测天数</Label>
              <Input
                type="number"
                className="h-8 w-24"
                value={backtestDays}
                min={10}
                max={365}
                onChange={(e) => setBacktestDays(Math.max(10, Number(e.target.value) || 60))}
              />
            </div>
            <Button onClick={() => void runBacktest()} disabled={bt.running || !symbols.length} size="sm">
              <Cpu className="mr-2 h-3.5 w-3.5" />
              {bt.running ? "运行中..." : "运行回测"}
            </Button>
          </div>

          {bt.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>回测失败</AlertTitle>
              <AlertDescription>{bt.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {bt.result ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="总收益" value={formatPercent(bt.result.metrics.totalReturn * 100)} variant={bt.result.metrics.totalReturn >= 0 ? "success" : "danger"} Icon={TrendingUp} />
            <StatCard label="最大回撤" value={formatPercent(bt.result.metrics.maxDrawdown * 100)} variant={bt.result.metrics.maxDrawdown > 0.1 ? "danger" : "default"} />
            <StatCard label="夏普比率" value={bt.result.metrics.sharpe.toFixed(2)} />
            <StatCard label="再平衡次数" value={bt.result.summary.rebalanceCount} sub={`换手 ${formatCurrency(bt.result.summary.turnoverNotional)}`} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">累计收益率曲线</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurveData} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={10} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis fontSize={10} tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l) => `日期: ${l}`} />
                    <Area type="monotone" dataKey="returnPct" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {timelineData.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">漂移时间线</CardTitle><CardDescription>每日最大漂移幅度，红色标记触发再平衡的日期</CardDescription></CardHeader>
              <CardContent>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timelineData} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={10} tickFormatter={(d: string) => d.slice(5)} />
                      <YAxis fontSize={10} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="maxDrift" name="最大漂移" fill="#94a3b8" radius={[2, 2, 0, 0]}>
                        {timelineData.map((entry, i) => (
                          <Cell key={`drift-${i}`} fill={entry.triggered ? "#ef4444" : "#94a3b8"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {eventsData.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">再平衡事件</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-[300px] overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>日期</TableHead><TableHead>指令</TableHead><TableHead className="text-right">换手金额</TableHead><TableHead>触发原因</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {eventsData.map((ev, i) => (
                        <TableRow key={`ev-${i}`}>
                          <TableCell className="text-xs">{ev.date}</TableCell>
                          <TableCell className="text-xs">
                            {ev.executed.map((o) => `${o.side} ${o.symbol}`).join(", ") || "-"}
                          </TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(ev.turnoverNotional)}</TableCell>
                          <TableCell className="max-w-[200px] text-xs text-muted-foreground">{ev.trigger.reasons.join("; ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {bt.result.warnings.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">回测告警</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {bt.result.warnings.slice(0, 10).map((w, i) => (
                  <div key={`bw-${i}`} className="rounded border border-amber-200 bg-amber-50/30 px-2 py-1 text-[11px] text-amber-800">{w}</div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {attribution ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">绩效归因（Attribution）</CardTitle>
                <CardDescription>
                  组合收益 {formatPercent(attribution.totalReturn * 100)}，基准 {attribution.benchmark.symbol} {formatPercent(attribution.benchmark.return * 100)}，
                  超额 {formatPercent(attribution.activeReturn * 100)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <StatCard label="Sharpe" value={attribution.metrics.sharpe.toFixed(2)} />
                  <StatCard label="MaxDD" value={formatPercent(attribution.metrics.maxDrawdown * 100)} />
                  <StatCard label="Calmar" value={attribution.metrics.calmar.toFixed(2)} />
                  <StatCard label="Volatility" value={formatPercent(attribution.metrics.volatility * 100)} />
                  <StatCard label="WinRate" value={formatPercent(attribution.metrics.winRate * 100)} />
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>资产</TableHead>
                        <TableHead className="text-right">平均权重</TableHead>
                        <TableHead className="text-right">资产收益</TableHead>
                        <TableHead className="text-right">收益贡献</TableHead>
                        <TableHead className="text-right">配置效应</TableHead>
                        <TableHead className="text-right">选择效应</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attribution.perAsset.map((row) => (
                        <TableRow key={`attr-${row.symbol}`}>
                          <TableCell className="font-medium">{row.symbol}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.avgWeight * 100)}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.assetReturn * 100)}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.contributionToReturn * 100)}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.allocationEffect * 100)}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.selectionEffect * 100)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">策略优化（真实回测驱动）</CardTitle>
          <CardDescription>
            在同一段历史行情上比较当前配置（Baseline）与四类单策略，并自动生成 Ensemble 候选权重。
            系数仅用于组合策略，最终权重会自动归一化；点击“写回优化后权重”后才会落库。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">优化回测天数</Label>
              <Input
                type="number"
                className="h-8 w-24"
                value={optimizationDays}
                min={30}
                max={365}
                onChange={(e) => setOptimizationDays(Math.max(30, Number(e.target.value) || 60))}
              />
            </div>
            <Button type="button" onClick={() => void runStrategyOptimization()} disabled={lab.running || symbols.length === 0}>
              {lab.running ? "优化中..." : "运行策略优化"}
            </Button>
            <Button type="button" variant="outline" onClick={rerunStrategyOptimization} disabled={lab.running || !lab.result}>
              基于当前数据重跑
            </Button>
          </div>

          {lab.error ? (
            <Alert variant="destructive">
              <AlertTitle>优化失败</AlertTitle>
              <AlertDescription>{lab.error}</AlertDescription>
            </Alert>
          ) : null}

          {lab.success ? (
            <Alert>
              <AlertTitle>优化完成</AlertTitle>
              <AlertDescription>
                {lab.success}
                {lab.rangeLabel !== "-" ? ` 回测区间：${lab.rangeLabel}` : ""}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="text-xs text-muted-foreground">
            组合系数总和：{ensembleAlphaSum.toFixed(2)}（系统会在回测前自动归一化为 100%）
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(ensembleConfig) as Array<keyof StrategyLabEnsembleConfigV1>).map((key) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{ENSEMBLE_LABELS_V1[key]}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={ensembleConfig[key]}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setEnsembleConfig((prev) => ({
                        ...prev,
                        [key]: Number.isFinite(value) ? Math.max(0, value) : prev[key],
                      }));
                    }}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    className="w-24"
                    value={ensembleConfig[key]}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setEnsembleConfig((prev) => ({
                        ...prev,
                        [key]: Number.isFinite(value) ? Math.max(0, value) : prev[key],
                      }));
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={applyEnsembleToConfig} disabled={!lab.result}>写回优化后权重</Button>
            <Button type="button" variant="outline" onClick={() => setEnsembleConfig(DEFAULT_ENSEMBLE_CONFIG_V1)}>恢复默认占比</Button>
          </div>

          {lab.ignoredSymbols.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50/30 p-2 text-xs text-amber-800">
              以下标的因历史数据不足被忽略：{lab.ignoredSymbols.join(", ")}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {lab.result ? (
        <>
          {baseline && ensemble ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-sm">Baseline 收益</CardTitle></CardHeader>
                <CardContent className="text-lg font-semibold">{formatPercent(baseline.backtest.metrics.totalReturn * 100)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-sm">Ensemble 收益</CardTitle></CardHeader>
                <CardContent className="text-lg font-semibold">{formatPercent(ensemble.backtest.metrics.totalReturn * 100)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-sm">超额收益</CardTitle></CardHeader>
                <CardContent className={`text-lg font-semibold ${activeReturn >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatPercent(activeReturn * 100)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-sm">Ensemble MaxDD</CardTitle></CardHeader>
                <CardContent className="text-lg font-semibold">{formatPercent(ensemble.backtest.metrics.maxDrawdown * 100)}</CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">优化策略回测对比</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>组合</TableHead>
                      <TableHead className="text-right">总收益</TableHead>
                      <TableHead className="text-right">MaxDD</TableHead>
                      <TableHead className="text-right">Sharpe</TableHead>
                      <TableHead className="text-right">再平衡次数</TableHead>
                      <TableHead className="text-right">换手金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lab.result.candidates.map((candidate) => (
                      <TableRow key={candidate.id}>
                        <TableCell className="font-medium">{candidate.label}</TableCell>
                        <TableCell className="text-right">{formatPercent(candidate.backtest.metrics.totalReturn * 100)}</TableCell>
                        <TableCell className="text-right">{formatPercent(candidate.backtest.metrics.maxDrawdown * 100)}</TableCell>
                        <TableCell className="text-right">{candidate.backtest.metrics.sharpe.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{candidate.backtest.summary.rebalanceCount}</TableCell>
                        <TableCell className="text-right">{formatCurrency(candidate.backtest.summary.turnoverNotional)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {optimizationCurveData.length ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Baseline vs Ensemble 累计收益率曲线</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={optimizationCurveData} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={10} tickFormatter={(value: string) => value.slice(5)} />
                      <YAxis fontSize={10} tickFormatter={(value: number) => `${value}%`} />
                      <Tooltip formatter={(value) => `${value}%`} labelFormatter={(label) => `日期: ${label}`} />
                      <Line type="monotone" dataKey="baseline" stroke="#64748b" strokeWidth={2} dot={false} name="Baseline" />
                      <Line type="monotone" dataKey="ensemble" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Ensemble" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">写回预览（优化后 vs 当前配置）</CardTitle>
            </CardHeader>
            <CardContent>
              {diffRows.length ? (
                <div className="overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead className="text-right">当前权重</TableHead>
                        <TableHead className="text-right">优化后</TableHead>
                        <TableHead className="text-right">变化</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diffRows.map((row) => (
                        <TableRow key={row.symbol}>
                          <TableCell className="font-medium">{row.symbol}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.currentWeight * 100)}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.nextWeight * 100)}</TableCell>
                          <TableCell className={`text-right ${row.deltaWeight >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {formatPercent(row.deltaWeight * 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">当前优化权重与配置一致，无需写回。</div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {equityHistory.length >= 2 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" /> 运行历史趋势</CardTitle>
            <CardDescription>每次运行时记录的总权益变化</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityHistory} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="ts" fontSize={10} />
                  <YAxis fontSize={10} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="equity" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
