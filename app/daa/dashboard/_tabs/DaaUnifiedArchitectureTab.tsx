"use client";

import { useMemo, useState } from "react";

import { AlertCircle, CheckCircle2, Cpu, RefreshCcw, ShieldAlert, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMarketDataClient } from "@/app/daa/useMarketDataClient";
import { readUnifiedInputSliceV1, saveUnifiedRequestDraftV1 } from "@/app/daa/unifiedInputStore";
import { DAA_UNIFIED_SAMPLE_REQUEST_V1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";
import DaaJiguBaoModule from "./_modules/DaaJiguBaoModule";

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

  const metrics = useMemo(() => {
    if (!parsedInput) return null;
    const positions = Array.isArray(parsedInput.positions) ? parsedInput.positions : [];
    const holdings = positions.reduce((sum, p) => sum + (Number(p.qty) || 0) * (Number(p.price) || 0), 0);
    const cash = Number(parsedInput.account?.cash || 0);
    const equity = Number(parsedInput.account?.totalEquity || holdings + cash);

    return {
      symbolCount: new Set(positions.map((p) => String(p.symbol || "").trim().toUpperCase()).filter(Boolean)).size,
      analystCount: Array.isArray(parsedInput.analysts) ? parsedInput.analysts.length : 0,
      assetViewCount: Array.isArray(parsedInput.assetViews) ? parsedInput.assetViews.length : 0,
      equity,
    };
  }, [parsedInput]);

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
      setSyncLog((prev) => [...nextLogs, ...prev].slice(0, 20));
    } catch (e) {
      setError(`实时同步失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),380px]">
        <Card className="border-sky-100 bg-gradient-to-br from-white via-sky-50/40 to-cyan-50/20">
          <CardHeader>
            <CardTitle className="text-base">DAA 统一运营台（Unified Core）</CardTitle>
            <CardDescription>以“数学底线 + 智慧过滤 + 风险隔离”为骨架，统一输入直连同一条决策链。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1 font-medium text-slate-900">数据感知层</div>
                <div>统一输入 + yfinance/雪球/Twitter 自动汇总。</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1 font-medium text-slate-900">策略计算层</div>
                <div>动态阈值 + 再平衡核心 + 解释型输出。</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1 font-medium text-slate-900">人因过滤层</div>
                <div>高手加权、价值陷阱、流派集中度预警。</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1 font-medium text-slate-900">风控执行层</div>
                <div>Tag 隔离 + Max In/Out + 流动性硬约束。</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">运行指标</CardTitle>
            <CardDescription>输入完整度与执行结果快照</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">标的数</span>
              <span className="font-medium">{metrics?.symbolCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">分析师数</span>
              <span className="font-medium">{metrics?.analystCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">资产视图数</span>
              <span className="font-medium">{metrics?.assetViewCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">权益估算</span>
              <span className="font-medium">{Number(metrics?.equity ?? 0).toLocaleString()}</span>
            </div>
            {result?.summary ? (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                {result.summary.shouldRebalance ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 当前满足再平衡触发
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <ShieldAlert className="h-3.5 w-3.5" /> 当前未达到触发条件
                  </span>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

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
            <CardTitle className="text-base">统一输入编排区</CardTitle>
            <CardDescription>拉取实时情报后直接执行统一决策。</CardDescription>
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

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void syncRealtimeIntel()} disabled={syncing}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {syncing ? "同步中..." : "接入真实情报并自动更新"}
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
              <CardTitle className="text-base">执行摘要</CardTitle>
              <CardDescription>统一引擎输出</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">总权益</span>
                <span className="font-medium">{Number(result?.summary?.totalEquity ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">触发阈值</span>
                <span className="font-medium">{((result?.summary?.triggerThresholdPct ?? 0) * 100).toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">执行订单</span>
                <span className="font-medium">{result?.summary?.executableOrderCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">拦截订单</span>
                <span className="font-medium">{result?.summary?.blockedOrderCount ?? 0}</span>
              </div>
              <div className="rounded-md border p-2 text-xs text-muted-foreground">
                隔离标的：{result?.layers?.guardrail?.isolatedSymbols?.length ? result.layers.guardrail.isolatedSymbols.join(", ") : "无"}
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">原始响应</CardTitle>
              <CardDescription>便于审计与导出</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea readOnly className="min-h-[260px] font-mono text-xs leading-5" value={resultText || "请先运行统一决策。"} />
            </CardContent>
          </Card>

          <Card className="border-cyan-100 bg-cyan-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-cyan-600" />
                架构升级建议
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-slate-700">
              <div>1. 把 Twitter/雪球解析结果沉淀到统一 event schema，减少字段漂移。</div>
              <div>2. 将实时同步流程切分为可观测任务链，补齐失败重试与告警。</div>
              <div>3. 基估宝模块建议接入日终回放，对“估值评分 → 实际收益”做自动校准。</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <DaaJiguBaoModule request={parsedInput} />
    </div>
  );
}
