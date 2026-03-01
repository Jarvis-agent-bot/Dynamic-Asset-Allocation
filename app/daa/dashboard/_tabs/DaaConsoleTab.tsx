"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  RefreshCcw,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import StatCard from "../_components/StatCard";
import { formatCurrency, formatNotional, formatPercent } from "../_components/daaFormatters";
import {
  appendEquitySnapshot,
  appendOpLog,
  buildUnifiedRequest,
  hasTodaySnapshot,
  toUserErrorMessage,
  useAnalysts,
  useAssetViews,
  useEquitySnapshots,
  useLastRunResult,
  useOpLog,
  usePositions,
  useRunHistory,
  useStrategyConfig,
} from "../_components/useDaaStore";
import { useMarketDataClient } from "../../useMarketDataClient";
import { patchUnifiedInputStateV1, readUnifiedInputSliceV1 } from "../../unifiedInputStore";
import type { DaaPositionRow } from "../../unifiedInputStore";
import { runUnifiedRebalanceV1 } from "@/src/daa/modules/execution/executionApiV1";

type ApiResult = {
  generatedAt?: string;
  summary?: {
    totalEquity?: number;
    triggerThresholdPct?: number;
    shouldRebalance?: boolean;
    executableOrderCount?: number;
    blockedOrderCount?: number;
  };
  layers?: {
    guardrail?: { isolatedSymbols?: string[] };
    humanFactor?: {
      defensiveConsensusPct?: number;
      assetDecisions?: Array<{
        symbol: string;
        tier: "elite" | "steady" | "watch" | "isolated";
        weightedScorePct: number;
        reasons: string[];
      }>;
    };
  };
  executableOrders?: Array<{ symbol: string; side: string; notional: number; cappedBy?: string[] }>;
  blockedOrders?: Array<{ symbol: string; side: string; notional: number; blockedBy: string }>;
  warnings?: string[];
};

type FlowStepState = "done" | "active" | "pending";

type FlowStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  state: FlowStepState;
};

export default function DaaConsoleTab() {
  const marketData = useMarketDataClient();

  const [positions] = usePositions();
  const [analysts] = useAnalysts();
  const [assetViews] = useAssetViews();
  const [config] = useStrategyConfig();
  const [lastRun, setLastRun] = useLastRunResult();
  const [runHistoryData] = useRunHistory();
  const [equitySnapshotsData] = useEquitySnapshots();
  const [opLogData] = useOpLog();

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const positionsList = positions ?? [];
  const analystsList = analysts ?? [];
  const viewsList = assetViews ?? [];
  const runHistory = runHistoryData ?? [];
  const equitySnapshots = equitySnapshotsData ?? [];
  const opLog = opLogData ?? [];

  const result = (selectedRunId ? runHistory.find((entry) => entry.id === selectedRunId)?.response : lastRun) as ApiResult | null;

  const autoSnapRef = useRef(false);

  const portfolioMetrics = useMemo(() => {
    const holdingsValue = positionsList.reduce((sum, p) => sum + p.qty * p.price, 0);
    const cash = config.account.cash;
    const equity = config.account.totalEquity ?? holdingsValue + cash;
    const symbolCount = new Set(positionsList.map((p) => p.symbol)).size;
    return { holdingsValue, cash, equity, symbolCount };
  }, [positionsList, config]);

  const targetWeightSummary = useMemo(() => {
    const entries = Object.entries(config.targetWeights);
    const weightSum = entries.reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
    const topWeights = [...entries]
      .sort(([, a], [, b]) => (Number(b) || 0) - (Number(a) || 0))
      .slice(0, 5);
    return { weightSum, topWeights };
  }, [config.targetWeights]);

  const humanSignalCount = result?.layers?.humanFactor?.assetDecisions?.length ?? 0;
  const hasData = positionsList.length > 0;
  const hasRunSummary = Boolean(result?.summary);
  const hasCollectedSignals = humanSignalCount > 0 || equitySnapshots.length > 0;
  const hasExecutableOrders = Number(result?.executableOrders?.length ?? 0) > 0;

  const flowSteps: FlowStep[] = useMemo(
    () => [
      {
        key: "config",
        title: "配置",
        description: hasData && targetWeightSummary.weightSum > 0 ? "持仓与目标权重已就绪" : "先完成持仓和策略配置",
        href: "/daa/dashboard/positions",
        cta: "去配置",
        state: hasData && targetWeightSummary.weightSum > 0 ? "done" : "active",
      },
      {
        key: "collect",
        title: "采集",
        description: hasCollectedSignals ? "已有行情/人因信号" : "先采集行情与基金池信号",
        href: "/daa/dashboard/human-factor",
        cta: "去采集",
        state: hasCollectedSignals ? "done" : hasData ? "active" : "pending",
      },
      {
        key: "run",
        title: "运行",
        description: hasRunSummary ? "最近一次运行已产出" : "运行统一决策引擎",
        href: "/daa/dashboard",
        cta: "运行决策",
        state: hasRunSummary ? "done" : hasData ? "active" : "pending",
      },
      {
        key: "execute",
        title: "执行",
        description: hasExecutableOrders ? "有可执行指令，进入执行回填流程" : "暂无执行指令，可转入风控审计",
        href: "/daa/dashboard/execution",
        cta: "去执行",
        state: hasExecutableOrders ? "active" : hasRunSummary ? "done" : "pending",
      },
    ],
    [hasCollectedSignals, hasData, hasExecutableOrders, hasRunSummary, targetWeightSummary.weightSum],
  );

  async function refreshPrices(): Promise<boolean> {
    const symbols = positionsList.map((p) => p.symbol).filter(Boolean);
    if (!symbols.length) return false;

    const updates: Record<string, number> = {};
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    for (const symbol of new Set(symbols)) {
      try {
        const series = await marketData.yfinance.priceSeriesBars({ symbol, start, end });
        const last = Number(series[series.length - 1]?.close || 0);
        if (last > 0) updates[symbol] = Number(last.toFixed(4));
      } catch {
        // ignore single symbol failures
      }
    }

    if (!Object.keys(updates).length) return false;

    const updatedPositions = positionsList.map((p) => {
      const nextPrice = updates[p.symbol];
      return nextPrice && nextPrice > 0 ? { ...p, price: nextPrice } : p;
    });

    patchUnifiedInputStateV1({ positions: updatedPositions });

    appendOpLog(`刷新行情完成：${Object.keys(updates).length} 个标的`);
    appendEquitySnapshot(
      updatedPositions.reduce((sum, p) => sum + p.qty * p.price, 0) + config.account.cash,
      updatedPositions.reduce((sum, p) => sum + p.qty * p.price, 0),
      config.account.cash,
      "refresh",
    );

    return true;
  }

  async function handleRefreshPrices() {
    if (busy || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const ok = await refreshPrices();
      if (!ok) setError("未获取到可用行情，请检查代码格式或数据源。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function runDecision() {
    if (busy || !hasData) return;
    setBusy(true);
    setError("");
    setSelectedRunId(null);

    try {
      await refreshPrices();
      const freshPositions = readUnifiedInputSliceV1<DaaPositionRow[]>("positions") ?? positionsList;
      const payload = buildUnifiedRequest(freshPositions, analystsList, viewsList, config);
      const { plan } = await runUnifiedRebalanceV1<ApiResult>(payload as unknown as Record<string, unknown>, { persist: true });

      setLastRun(plan);
      window.dispatchEvent(new CustomEvent("daa:dashboard:refresh"));

      const holdingsValue = freshPositions.reduce((sum, p) => sum + p.qty * p.price, 0);
      appendEquitySnapshot(holdingsValue + config.account.cash, holdingsValue, config.account.cash, "run");
      appendOpLog(`运行决策：${plan?.summary?.shouldRebalance ? "触发再平衡" : "维持当前仓位"}`);
    } catch (e) {
      setError(toUserErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoSnapRef.current || !positionsList.length) return;
    autoSnapRef.current = true;
    if (!hasTodaySnapshot()) {
      void handleRefreshPrices();
    }
  }, [positionsList.length]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void runDecision()} disabled={busy || refreshing || !hasData} size="sm">
          <Cpu className="mr-2 h-3.5 w-3.5" />
          {busy ? "运行中..." : "运行决策"}
        </Button>
        <Button onClick={() => void handleRefreshPrices()} disabled={refreshing || busy || !hasData} variant="outline" size="sm">
          <RefreshCcw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "刷新中..." : "刷新行情"}
        </Button>
        <Button asChild variant="outline" size="sm"><Link href="/daa/dashboard/positions">持仓配置</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/daa/dashboard/strategy">策略配置</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/daa/dashboard/human-factor">人因采集</Link></Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>异常</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-sky-200/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">主流程看板</CardTitle>
          <CardDescription>控制台负责编排，不直接编辑配置，建议按流程推进。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {flowSteps.map((step, index) => (
              <div key={step.key} className="rounded-lg border bg-background p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium">{index + 1}</span>
                    <span className="text-sm font-medium">{step.title}</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${step.state === "done" ? "bg-emerald-100 text-emerald-700" : step.state === "active" ? "bg-sky-100 text-sky-700" : "bg-muted text-muted-foreground"}`}>
                    {step.state === "done" ? "已完成" : step.state === "active" ? "当前建议" : "待完成"}
                  </span>
                </div>
                <p className="mb-3 min-h-[36px] text-xs text-muted-foreground">{step.description}</p>
                <Button asChild size="sm" variant={step.state === "active" ? "default" : "outline"} className="w-full">
                  <Link href={step.href}>{step.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="总权益" value={formatCurrency(portfolioMetrics.equity)} Icon={DollarSign} />
        <StatCard label="持仓市值" value={formatCurrency(portfolioMetrics.holdingsValue)} Icon={TrendingUp} />
        <StatCard label="现金" value={formatCurrency(portfolioMetrics.cash)} Icon={Wallet} />
        <StatCard label="标的 / 人因信号" value={`${portfolioMetrics.symbolCount} / ${humanSignalCount}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="space-y-4">
          {equitySnapshots.length >= 2 ? (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" />资产曲线</CardTitle>
                <CardDescription className="text-[11px]">每日与运行节点的权益快照</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={equitySnapshots.map((s) => ({ ts: new Date(s.ts).toLocaleDateString(), equity: s.equity }))}
                      margin={{ left: 6, right: 10, top: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="ts" fontSize={10} />
                      <YAxis fontSize={10} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} width={40} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Area type="monotone" dataKey="equity" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.16} strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {result?.summary ? (
            <Card className={result.summary.shouldRebalance ? "border-emerald-200" : "border-amber-200"}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  {result.summary.shouldRebalance ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
                  {result.summary.shouldRebalance ? "再平衡已触发" : "未达到触发条件"}
                </CardTitle>
                <CardDescription className="text-[11px]">最新一次运行结果摘要。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">权益</span><span>{formatCurrency(result.summary.totalEquity ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">阈值</span><span>{formatPercent((result.summary.triggerThresholdPct ?? 0) * 100)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">可执行 / 阻断</span><span>{result.summary.executableOrderCount ?? 0} / {result.summary.blockedOrderCount ?? 0}</span></div>
              </CardContent>
            </Card>
          ) : null}

          {result ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">机会 / 风险决策参考</CardTitle>
                <CardDescription className="text-[11px]">整合可执行动作、阻断信息与告警，辅助判断机会与风险。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border bg-emerald-50/40 p-2 dark:bg-emerald-950/10">
                  <div className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">机会（可执行）</div>
                  {(result.executableOrders?.length ?? 0) > 0 ? (
                    <div className="max-h-[220px] overflow-auto rounded-md border bg-background">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-xs">代码</TableHead><TableHead className="text-xs">方向</TableHead><TableHead className="text-right text-xs">金额</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {result.executableOrders?.map((order, i) => (
                            <TableRow key={`e-${i}`}>
                              <TableCell className="text-xs font-medium">{order.symbol}</TableCell>
                              <TableCell className={`text-xs font-medium ${order.side === "BUY" ? "text-emerald-600" : "text-red-600"}`}>{order.side === "BUY" ? "买入" : "卖出"}</TableCell>
                              <TableCell className="text-right text-xs">{formatNotional(order.notional)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">当前没有可执行机会。</div>
                  )}
                </div>

                <div className="rounded-lg border bg-amber-50/40 p-2 dark:bg-amber-950/10">
                  <div className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">风险（阻断 & 告警）</div>
                  <div className="space-y-2">
                    {result.layers?.guardrail?.isolatedSymbols?.length ? (
                      <div className="rounded border border-red-200 bg-red-50/50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
                        已隔离: {result.layers.guardrail.isolatedSymbols.join(", ")}
                      </div>
                    ) : null}

                    {result.blockedOrders?.map((order, i) => (
                      <div key={`b-${i}`} className="flex items-center justify-between rounded border border-amber-200 bg-background px-2 py-1 text-xs">
                        <span>{order.side === "BUY" ? "买入" : "卖出"} {order.symbol} {formatNotional(order.notional)}</span>
                        <span className="text-muted-foreground">{order.blockedBy}</span>
                      </div>
                    ))}

                    {result.warnings?.slice(0, 6).map((warning, i) => (
                      <div key={`w-${i}`} className="rounded border border-amber-200 bg-background px-2 py-1 text-[11px] text-amber-800 dark:border-amber-800 dark:text-amber-300">
                        {warning}
                      </div>
                    ))}

                    {!result.blockedOrders?.length && !result.warnings?.length && !result.layers?.guardrail?.isolatedSymbols?.length ? (
                      <div className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">当前没有显著风险信号。</div>
                    ) : null}
                  </div>
                </div>

                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href="/daa/dashboard/risk">进入风控审计查看完整解释</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-sm"><Clock className="h-3.5 w-3.5" />运行历史</CardTitle></CardHeader>
            <CardContent>
              {runHistory.length ? (
                <div className="max-h-[180px] space-y-1 overflow-auto">
                  {runHistory.map((entry) => {
                    const item = entry.response as ApiResult | null;
                    const isSelected = selectedRunId === entry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs transition-colors ${isSelected ? "border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30" : "hover:bg-muted/50"}`}
                        onClick={() => setSelectedRunId(isSelected ? null : entry.id)}
                      >
                        <div className="min-w-0">
                          <span className="text-muted-foreground">{new Date(entry.ts).toLocaleString()}</span>
                          {item?.summary?.shouldRebalance ? <span className="ml-1.5 text-emerald-600">再平衡</span> : <span className="ml-1.5 text-amber-600">维持</span>}
                        </div>
                        <span className="ml-2 shrink-0 text-muted-foreground">{formatCurrency(item?.summary?.totalEquity ?? 0)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">运行后会记录历史，最多保留 20 条。</div>
              )}
              {selectedRunId ? <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setSelectedRunId(null)}>← 返回最新结果</Button> : null}
            </CardContent>
          </Card>

          {opLog.length ? (
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">操作日志</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-[120px] overflow-auto text-[11px] text-muted-foreground">
                  {opLog.slice(0, 15).map((line, index) => <div key={`ol-${index}`}>{line}</div>)}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
