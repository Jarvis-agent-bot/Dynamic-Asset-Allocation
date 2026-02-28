"use client";

import { useMemo, useState } from "react";

import { AlertCircle, ArrowRight, CheckCircle2, Cpu, Database, LineChart, RefreshCcw, ShieldAlert, Signal } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMarketDataClient } from "@/app/daa/useMarketDataClient";
import { readUnifiedInputSliceV1, saveUnifiedRequestDraftV1 } from "@/app/daa/unifiedInputStore";
import { DAA_UNIFIED_SAMPLE_REQUEST_V1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

type ApiResult = {
  summary?: {
    totalEquity?: number;
    triggerThresholdPct?: number;
    shouldRebalance?: boolean;
    executableOrderCount?: number;
    blockedOrderCount?: number;
  };
  layers?: {
    sensory?: {
      crossMarketExposure?: Record<string, number>;
      liquidityCoveragePct?: number;
    };
    strategy?: {
      adjustedTargetWeights?: Record<string, number>;
    };
    guardrail?: {
      isolatedSymbols?: string[];
    };
    humanFactor?: {
      defensiveConsensusPct?: number;
      duplicatedStyleClusters?: string[];
    };
  };
  executableOrders?: Array<{ symbol: string; side: string; notional: number; cappedBy?: string[] }>;
  blockedOrders?: Array<{ symbol: string; side: string; notional: number; blockedBy: string }>;
  warnings?: string[];
};

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "{}";
  }
}

function parseJsonSafe<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function normalizeSymbolList(raw: string): string[] {
  return String(raw || "")
    .split(/[\s,;，；]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function clamp(min: number, value: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function extractXueqiuLatestPrice(payload: unknown): number | null {
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();

  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;
    if (visited.has(node)) continue;
    visited.add(node);

    const row = node as Record<string, unknown>;
    const candidates = [row.current, row.latest, row.last, row.price];
    for (const c of candidates) {
      const n = typeof c === "number" ? c : Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }

    for (const child of Object.values(row)) {
      if (child && typeof child === "object") queue.push(child);
    }
  }

  return null;
}

function sentimentFromText(text: string): number {
  const src = String(text || "").toLowerCase();
  if (!src) return 0;

  const positive = ["bull", "breakout", "upgrade", "beat", "利好", "走强", "突破", "增持", "看多"];
  const negative = ["bear", "drawdown", "downgrade", "miss", "risk-off", "利空", "走弱", "减持", "看空", "暴雷"];

  let score = 0;
  for (const w of positive) {
    if (src.includes(w)) score += 1;
  }
  for (const w of negative) {
    if (src.includes(w)) score -= 1;
  }
  return score;
}

function applyRealtimeSignals(
  request: DaaUnifiedRequestV1,
  args: {
    priceUpdates: Record<string, number>;
    momentumBySymbol: Record<string, "strong" | "neutral" | "weak">;
    sentimentScore: number;
  },
): DaaUnifiedRequestV1 {
  const next: DaaUnifiedRequestV1 = {
    ...request,
    positions: (request.positions || []).map((p) => {
      const symbol = String(p.symbol || "").trim().toUpperCase();
      const price = args.priceUpdates[symbol];
      return {
        ...p,
        symbol,
        price: Number.isFinite(price) && price > 0 ? price : p.price,
      };
    }),
    assetViews: (request.assetViews || []).map((v) => {
      const symbol = String(v.symbol || "").trim().toUpperCase();
      const sentimentAdj = clamp(-18, args.sentimentScore * 3, 18);
      const conviction = clamp(20, Number(v.convictionPct || 60) + sentimentAdj, 95);
      const drift = clamp(1, Number(v.thesisDriftPct || 8) - sentimentAdj * 0.25, 30);
      return {
        ...v,
        symbol,
        convictionPct: Number(conviction.toFixed(2)),
        thesisDriftPct: Number(drift.toFixed(2)),
        momentumRegime: args.momentumBySymbol[symbol] ?? v.momentumRegime ?? "neutral",
      };
    }),
  };

  const covered = new Set((next.assetViews || []).map((v) => String(v.symbol || "").trim().toUpperCase()).filter(Boolean));
  for (const symbol of Object.keys(args.momentumBySymbol)) {
    if (covered.has(symbol)) continue;
    const analystId = next.analysts?.[0]?.analystId || "operator";
    next.assetViews = [
      ...(next.assetViews || []),
      {
        symbol,
        analystId,
        convictionPct: 58,
        thesisDriftPct: 6,
        momentumRegime: args.momentumBySymbol[symbol],
      },
    ];
  }

  return next;
}

function formatPercent(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "0.00%";
  return `${v.toFixed(digits)}%`;
}

function formatNotional(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString();
}

export default function DaaUnifiedArchitectureTab() {
  const marketData = useMarketDataClient();

  const [input, setInput] = useState(() => {
    const unifiedDraft = readUnifiedInputSliceV1("unifiedRequestDraft");
    if (unifiedDraft && typeof unifiedDraft === "object") {
      return prettyJson(unifiedDraft);
    }
    return prettyJson(DAA_UNIFIED_SAMPLE_REQUEST_V1);
  });

  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [resultText, setResultText] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);

  const [baseTriggerPct, setBaseTriggerPct] = useState("5");
  const [strongTriggerPct, setStrongTriggerPct] = useState("10");

  const [feedSymbolsText, setFeedSymbolsText] = useState("SPY,QQQ,BND,TSLA");
  const [twitterQuery, setTwitterQuery] = useState("(SPY OR QQQ OR TSLA) lang:en");
  const [syncLog, setSyncLog] = useState<string[]>([]);

  const parsedInput = useMemo(() => parseJsonSafe<DaaUnifiedRequestV1>(input), [input]);

  const inputMetrics = useMemo(() => {
    if (!parsedInput) return null;

    const positions = Array.isArray(parsedInput.positions) ? parsedInput.positions : [];
    const holdings = positions.reduce((sum, p) => sum + (Number(p.qty) || 0) * (Number(p.price) || 0), 0);
    const cash = Number(parsedInput.account?.cash || 0);
    const equity = Number(parsedInput.account?.totalEquity || holdings + cash);

    const symbolCount = new Set(positions.map((p) => String(p.symbol || "").trim().toUpperCase()).filter(Boolean)).size;
    const analystCount = Array.isArray(parsedInput.analysts) ? parsedInput.analysts.length : 0;
    const assetViewCount = Array.isArray(parsedInput.assetViews) ? parsedInput.assetViews.length : 0;

    return {
      symbolCount,
      analystCount,
      assetViewCount,
      equity,
    };
  }, [parsedInput]);

  const strategySignals = useMemo(() => {
    const exposure = result?.layers?.sensory?.crossMarketExposure ?? {};
    const exposureItems = Object.entries(exposure)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 6);

    const targetWeights = result?.layers?.strategy?.adjustedTargetWeights ?? {};
    const targetItems = Object.entries(targetWeights)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 6);

    const defensiveConsensusPct = Number(result?.layers?.humanFactor?.defensiveConsensusPct || 0) * 100;
    const liquidityCoveragePct = Number(result?.layers?.sensory?.liquidityCoveragePct || 0) * 100;

    return {
      exposureItems,
      targetItems,
      defensiveConsensusPct,
      liquidityCoveragePct,
      duplicatedStyleClusters: result?.layers?.humanFactor?.duplicatedStyleClusters ?? [],
      isolatedSymbols: result?.layers?.guardrail?.isolatedSymbols ?? [],
    };
  }, [result]);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      if (!parsedInput || typeof parsedInput !== "object") {
        setError("输入 JSON 无法解析，请先修复格式。");
        return;
      }

      const req = {
        ...(parsedInput as Record<string, unknown>),
        policy: {
          ...((parsedInput as any)?.policy ?? {}),
          baseDriftTriggerPct: Number(baseTriggerPct) / 100,
          strongTrendDriftTriggerPct: Number(strongTriggerPct) / 100,
        },
      };

      const res = await fetch("/api/daa/rebalance/unified", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(req),
      });

      const text = await res.text();
      const json = parseJsonSafe<ApiResult & { error?: string }>(text);

      if (!res.ok) {
        setError(String(json?.error ?? `HTTP ${res.status}`));
        setResult(null);
        setResultText(text || "");
        return;
      }

      setResult(json as ApiResult);
      setResultText(prettyJson(json));
      saveUnifiedRequestDraftV1(req, { dispatchEvent: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncRealtimeIntel() {
    if (syncing) return;
    setSyncing(true);
    setError("");

    try {
      if (!parsedInput) {
        setError("请先保证统一输入 JSON 可解析，然后再同步实时数据。");
        return;
      }

      const symbols = normalizeSymbolList(feedSymbolsText);
      if (!symbols.length) {
        setError("请至少输入一个行情 symbol。");
        return;
      }

      const nextLogs: string[] = [];
      const priceUpdates: Record<string, number> = {};
      const momentumBySymbol: Record<string, "strong" | "neutral" | "weak"> = {};

      const today = new Date();
      const start = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
      const end = today.toISOString().slice(0, 10);

      for (const symbol of symbols) {
        try {
          const series = await marketData.yfinance.priceSeriesBars({ symbol, start, end });
          const last = Number(series[series.length - 1]?.close || 0);
          const first = Number(series[0]?.close || 0);
          if (last > 0) {
            priceUpdates[symbol] = last;
            const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
            momentumBySymbol[symbol] = changePct >= 4 ? "strong" : changePct <= -4 ? "weak" : "neutral";
            nextLogs.push(`${symbol} yfinance 更新价格=${last.toFixed(2)}，30日变化=${changePct.toFixed(2)}%`);
          }
        } catch (e) {
          nextLogs.push(`${symbol} yfinance 失败：${e instanceof Error ? e.message : String(e)}`);
        }
      }

      for (const symbol of symbols.filter((s) => /^(SH|SZ)\d+$/i.test(s) || /^HK\d+$/i.test(s))) {
        try {
          const quote = (await marketData.xueqiu.quoteC({ symbol })) as any;
          const price = extractXueqiuLatestPrice(quote?.payload);
          if (price && price > 0) {
            priceUpdates[symbol] = price;
            nextLogs.push(`${symbol} 雪球更新价格=${price.toFixed(2)}`);
          }
        } catch (e) {
          nextLogs.push(`${symbol} 雪球失败：${e instanceof Error ? e.message : String(e)}`);
        }
      }

      let sentimentScore = 0;
      try {
        const twitter = (await marketData.twitter.search({ rawQuery: twitterQuery, limit: 40 })) as any;
        const raw = JSON.stringify(twitter?.payload ?? "");
        sentimentScore = sentimentFromText(raw);
        nextLogs.push(`Twitter 情绪分=${sentimentScore >= 0 ? "+" : ""}${sentimentScore}`);
      } catch (e) {
        nextLogs.push(`Twitter 情绪拉取失败：${e instanceof Error ? e.message : String(e)}`);
      }

      const merged = applyRealtimeSignals(parsedInput, {
        priceUpdates,
        momentumBySymbol,
        sentimentScore,
      });

      setInput(prettyJson(merged));
      saveUnifiedRequestDraftV1(merged, { dispatchEvent: false });
      setSyncLog((prev) => [...nextLogs, ...prev].slice(0, 30));
    } catch (e) {
      setError(`实时同步失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-sky-100 bg-gradient-to-br from-white via-sky-50/50 to-cyan-50/20">
        <CardHeader>
          <CardTitle className="text-base">DAA 统一运营台架构</CardTitle>
          <CardDescription>数学底线 + 智慧过滤 + 风险隔离，所有模块只保留一条统一输入与统一输出链路。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs text-slate-700 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-1 inline-flex items-center gap-1 font-medium text-slate-900">
              <Database className="h-3.5 w-3.5" /> 输入层
            </div>
            <div>统一 JSON 输入、阈值、仓位与规则。</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-1 inline-flex items-center gap-1 font-medium text-slate-900">
              <Signal className="h-3.5 w-3.5" /> 信号层
            </div>
            <div>yfinance / 雪球 / Twitter 情报汇总。</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-1 inline-flex items-center gap-1 font-medium text-slate-900">
              <Cpu className="h-3.5 w-3.5" /> 计算层
            </div>
            <div>统一再平衡引擎 + 人因过滤。</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-1 inline-flex items-center gap-1 font-medium text-slate-900">
              <LineChart className="h-3.5 w-3.5" /> 指标层
            </div>
            <div>输入完整度、风险暴露、触发状态。</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-1 inline-flex items-center gap-1 font-medium text-slate-900">
              <ShieldAlert className="h-3.5 w-3.5" /> 输出层
            </div>
            <div>可执行订单、阻断订单、告警清单。</div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>执行异常</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),420px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">输入层（Input Hub）</CardTitle>
            <CardDescription>先同步实时情报，再执行统一决策。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daa-threshold-base">基础触发阈值（%）</Label>
                <Input id="daa-threshold-base" value={baseTriggerPct} onChange={(e) => setBaseTriggerPct(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daa-threshold-strong">强势持仓阈值（%）</Label>
                <Input id="daa-threshold-strong" value={strongTriggerPct} onChange={(e) => setStrongTriggerPct(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="daa-feed-symbols">行情 Symbols（逗号分隔）</Label>
                  <Input id="daa-feed-symbols" value={feedSymbolsText} onChange={(e) => setFeedSymbolsText(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daa-twitter-query">Twitter 查询语句</Label>
                  <Input id="daa-twitter-query" value={twitterQuery} onChange={(e) => setTwitterQuery(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Database className="h-3.5 w-3.5" />
                  输入
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="inline-flex items-center gap-1">
                  <Signal className="h-3.5 w-3.5" />
                  信号
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5" />
                  输出
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void syncRealtimeIntel()} disabled={syncing}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {syncing ? "同步中..." : "同步真实情报源"}
                </Button>
                <Button type="button" onClick={() => void run()} disabled={busy}>
                  <Cpu className="mr-2 h-4 w-4" />
                  {busy ? "计算中..." : "运行统一决策"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setInput(prettyJson(DAA_UNIFIED_SAMPLE_REQUEST_V1));
                    setError("");
                  }}
                >
                  重置样例
                </Button>
              </div>
            </div>

            <Textarea
              className="min-h-[460px] font-mono text-xs leading-5"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">系统概览（Overview）</CardTitle>
              <CardDescription>输入规模与当前执行状态</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">标的数</span>
                <span className="font-medium">{inputMetrics?.symbolCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">分析师数</span>
                <span className="font-medium">{inputMetrics?.analystCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">资产视图数</span>
                <span className="font-medium">{inputMetrics?.assetViewCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">权益估算</span>
                <span className="font-medium">{formatNotional(Number(inputMetrics?.equity ?? 0))}</span>
              </div>
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-muted-foreground">
                流动性覆盖：{formatPercent(strategySignals.liquidityCoveragePct)}
              </div>
              {result?.summary ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                  {result.summary.shouldRebalance ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 已触发再平衡
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <ShieldAlert className="h-3.5 w-3.5" /> 未达到触发条件
                    </span>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">信号与指标（Signal Bus）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <div className="mb-1 text-muted-foreground">跨市场暴露</div>
                <div className="space-y-1">
                  {strategySignals.exposureItems.length ? (
                    strategySignals.exposureItems.map(([k, v]) => (
                      <div key={`exp-${k}`} className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1">
                        <span>{k}</span>
                        <span className="font-medium">{formatPercent(Number(v) * 100)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">暂无</div>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-1 text-muted-foreground">调整后目标权重</div>
                <div className="space-y-1">
                  {strategySignals.targetItems.length ? (
                    strategySignals.targetItems.map(([k, v]) => (
                      <div key={`target-${k}`} className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1">
                        <span>{k}</span>
                        <span className="font-medium">{formatPercent(Number(v) * 100)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">暂无</div>
                  )}
                </div>
              </div>

              <div className="rounded-md border bg-slate-50 p-2 text-muted-foreground">
                防守共识：{formatPercent(strategySignals.defensiveConsensusPct)}；风格聚类：
                {strategySignals.duplicatedStyleClusters.length ? strategySignals.duplicatedStyleClusters.join(" / ") : "无"}
              </div>

              <div className="rounded-md border bg-slate-50 p-2 text-muted-foreground">
                隔离标的：{strategySignals.isolatedSymbols.length ? strategySignals.isolatedSymbols.join(", ") : "无"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">情报同步日志</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[220px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                {syncLog.length ? (
                  syncLog.map((line, idx) => (
                    <div key={`sync-log-${idx}`} className="py-1 text-slate-700">
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">还没有同步记录。</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">输出（Executable Orders）</CardTitle>
            <CardDescription>引擎允许执行的指令</CardDescription>
          </CardHeader>
          <CardContent>
            {result?.executableOrders?.length ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标的</TableHead>
                      <TableHead>方向</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead>约束</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.executableOrders.map((row, idx) => (
                      <TableRow key={`exec-${row.symbol}-${idx}`}>
                        <TableCell className="font-medium">{row.symbol}</TableCell>
                        <TableCell>{row.side}</TableCell>
                        <TableCell className="text-right">{formatNotional(Number(row.notional || 0))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.cappedBy?.length ? row.cappedBy.join(", ") : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无可执行指令。</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">风控阻断（Blocked + Warnings）</CardTitle>
            <CardDescription>被拦截指令与风险告警</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result?.blockedOrders?.length ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标的</TableHead>
                      <TableHead>方向</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead>阻断原因</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.blockedOrders.map((row, idx) => (
                      <TableRow key={`blocked-${row.symbol}-${idx}`}>
                        <TableCell className="font-medium">{row.symbol}</TableCell>
                        <TableCell>{row.side}</TableCell>
                        <TableCell className="text-right">{formatNotional(Number(row.notional || 0))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.blockedBy || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">当前无阻断订单。</div>
            )}

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">告警列表</div>
              {result?.warnings?.length ? (
                result.warnings.map((warning, idx) => (
                  <div key={`warn-${idx}`} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    {warning}
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">暂无系统告警。</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">原始响应（审计）</CardTitle>
          <CardDescription>用于排障、复盘与导出</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea readOnly className="min-h-[220px] font-mono text-xs leading-5" value={resultText || "请先运行统一决策。"} />
        </CardContent>
      </Card>
    </div>
  );
}
