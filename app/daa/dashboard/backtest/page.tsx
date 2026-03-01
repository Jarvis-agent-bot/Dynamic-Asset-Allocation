"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Clock, Cpu, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import StatCard from "../_components/StatCard";
import { formatCurrency, formatPercent } from "../_components/daaFormatters";
import { usePositions, useStrategyConfig, useRunHistory } from "../_components/useDaaStore";
import { useMarketDataClient } from "../../useMarketDataClient";

import { backtestDriftRebalance, type DriftRebalanceBacktestResult } from "@/src/core/backtestDriftRebalance";

type BacktestState = { running: boolean; error: string; result: DriftRebalanceBacktestResult | null };

export default function BacktestPage() {
  const [positions] = usePositions();
  const [config] = useStrategyConfig();
  const [runHistoryData] = useRunHistory();
  const marketData = useMarketDataClient();

  const positionsList = positions ?? [];
  const runHistory = runHistoryData ?? [];

  const [days, setDays] = useState(60);
  const [bt, setBt] = useState<BacktestState>({ running: false, error: "", result: null });

  const symbols = useMemo(() => {
    const s = new Set<string>();
    for (const p of positionsList) s.add(p.symbol);
    for (const sym of Object.keys(config.targetWeights)) s.add(sym);
    return Array.from(s).filter(Boolean).sort();
  }, [positionsList, config]);

  async function runBacktest() {
    if (bt.running || !symbols.length) return;
    setBt({ running: true, error: "", result: null });

    try {
      const today = new Date();
      const start = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
      const end = today.toISOString().slice(0, 10);

      const seriesBySymbol: Record<string, Array<{ date: string; close: number }>> = {};

      for (const symbol of symbols) {
        try {
          const bars = await marketData.yfinance.priceSeriesBars({ symbol, start, end });
          if (bars.length >= 2) {
            seriesBySymbol[symbol] = bars.map((b: any) => ({ date: String(b.date), close: Number(b.close) }));
          }
        } catch {
          // skip unavailable symbols
        }
      }

      const availableSymbols = Object.keys(seriesBySymbol);
      if (availableSymbols.length < 1) {
        setBt({ running: false, error: "无法获取任何标的的历史数据，请检查代码格式。", result: null });
        return;
      }

      const minLen = Math.min(...Object.values(seriesBySymbol).map((s) => s.length));
      for (const sym of availableSymbols) {
        seriesBySymbol[sym] = seriesBySymbol[sym].slice(-minLen);
      }

      const tw: Record<string, number> = {};
      for (const sym of availableSymbols) {
        tw[sym] = config.targetWeights[sym] ?? 0;
      }
      const twSum = Object.values(tw).reduce((s, v) => s + v, 0);
      if (twSum <= 0) {
        for (const sym of availableSymbols) tw[sym] = 1 / availableSymbols.length;
      }

      const initialHoldings: Record<string, number> = {};
      for (const p of positionsList) {
        if (availableSymbols.includes(p.symbol)) {
          initialHoldings[p.symbol] = (initialHoldings[p.symbol] ?? 0) + p.qty;
        }
      }

      const result = backtestDriftRebalance({
        seriesBySymbol,
        targetWeights: tw,
        initialHoldings: Object.keys(initialHoldings).length ? initialHoldings : undefined,
        initialCash: config.account.cash || undefined,
        initialEquity: Object.keys(initialHoldings).length ? undefined : 10000,
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

      setBt({ running: false, error: "", result });
    } catch (e) {
      setBt({ running: false, error: e instanceof Error ? e.message : String(e), result: null });
    }
  }

  const equityCurveData = useMemo(() => {
    if (!bt.result) return [];
    return bt.result.dates.map((date, i) => ({
      date,
      equity: Number((bt.result!.equity[i] * 100).toFixed(2)),
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

  return (
    <div className="space-y-6">
      <PageHeader title="回测复盘" description="验证当前配置在历史行情下的表现，不修改实时配置。" />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">漂移回测</CardTitle>
          <CardDescription>
            拉取 yfinance 历史数据，使用当前策略参数运行 backtestDriftRebalance。
            配置快照来自当前统一输入状态（持仓/目标权重/约束）。
            {symbols.length ? ` 标的: ${symbols.join(", ")}` : " (无标的)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">回测天数</Label>
              <Input type="number" className="h-8 w-24" value={days} min={10} max={365} onChange={(e) => setDays(Math.max(10, Number(e.target.value) || 60))} />
            </div>
            <Button onClick={() => void runBacktest()} disabled={bt.running || !symbols.length} size="sm">
              <Cpu className="mr-2 h-3.5 w-3.5" />
              {bt.running ? "运行中..." : "运行回测"}
            </Button>
          </div>

          {bt.error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>回测失败</AlertTitle><AlertDescription>{bt.error}</AlertDescription></Alert> : null}
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
            <CardHeader className="pb-2"><CardTitle className="text-base">权益曲线</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurveData} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={10} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis fontSize={10} tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l) => `日期: ${l}`} />
                    <Area type="monotone" dataKey="equity" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} strokeWidth={2} />
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
        </>
      ) : null}

      {/* Historical Run Trend */}
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
