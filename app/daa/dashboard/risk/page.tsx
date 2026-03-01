"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import StatCard from "../_components/StatCard";
import { formatCurrency, formatNotional, formatPercent } from "../_components/daaFormatters";
import { useLastRunResult, useRunHistory } from "../_components/useDaaStore";

type ApiResult = {
  ok?: boolean;
  generatedAt?: string;
  summary?: {
    totalEquity?: number;
    triggerThresholdPct?: number;
    shouldRebalance?: boolean;
    executableOrderCount?: number;
    blockedOrderCount?: number;
  };
  layers?: {
    guardrail?: {
      isolatedSymbols?: string[];
      maxOrderPctOfNav?: number;
      maxOrderPctOfLiquidity?: number;
      riskOffReason?: string | null;
      concentrationWarnings?: string[];
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

function warningTone(warning: string): "high" | "medium" {
  const value = String(warning || "").toLowerCase();
  if (
    value.includes("isolate")
    || value.includes("隔离")
    || value.includes("liquidity")
    || value.includes("流动性")
  ) {
    return "high";
  }
  return "medium";
}

export default function RiskAuditPage() {
  const [lastRun] = useLastRunResult();
  const [runHistoryData] = useRunHistory();
  const [selectedRunId, setSelectedRunId] = useState<string>("latest");
  const [showRawRequest, setShowRawRequest] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);

  const runHistory = runHistoryData ?? [];
  const selectedHistory = selectedRunId === "latest" ? null : runHistory.find((item) => item.id === selectedRunId) ?? null;

  const result = (selectedHistory?.response ?? lastRun) as ApiResult | null;
  const requestPayload = selectedHistory?.request ?? null;

  const auditRows = useMemo(() => {
    const executable = (result?.executableOrders ?? []).map((order) => ({
      status: "可执行",
      tone: "success" as const,
      symbol: order.symbol,
      side: order.side,
      notional: order.notional,
      reason: order.cappedBy?.length ? order.cappedBy.join(" / ") : "-",
    }));

    const blocked = (result?.blockedOrders ?? []).map((order) => ({
      status: "阻断",
      tone: "risk" as const,
      symbol: order.symbol,
      side: order.side,
      notional: order.notional,
      reason: order.blockedBy || "-",
    }));

    return [...executable, ...blocked];
  }, [result]);

  const isolatedSymbols = result?.layers?.guardrail?.isolatedSymbols ?? [];
  const duplicatedStyleClusters = result?.layers?.humanFactor?.duplicatedStyleClusters ?? [];
  const concentrationWarnings = result?.layers?.guardrail?.concentrationWarnings ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="风控审计" description="唯一入口：审计解释与风险复核，不直接编辑配置。" />

      <Card className="border-muted-foreground/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
          <div className="text-sm text-muted-foreground">
            当前页为审计视角：定位风险原因、识别可执行机会、复核规则约束。
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/daa/dashboard">回控制台运行</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/daa/dashboard/human-factor">调整基金池</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">审计对象</CardTitle>
          <CardDescription>可切换最近一次运行或历史快照进行复盘。</CardDescription>
        </CardHeader>
        <CardContent>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
          >
            <option value="latest">最新运行结果</option>
            {runHistory.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {new Date(entry.ts).toLocaleString()} · {entry.id}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {!result?.summary ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>暂无审计数据</AlertTitle>
          <AlertDescription>请先在控制台运行一次统一决策，再回到本页查看解释。</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="再平衡状态"
              value={result.summary.shouldRebalance ? "已触发" : "未触发"}
              variant={result.summary.shouldRebalance ? "success" : "warning"}
              Icon={result.summary.shouldRebalance ? CheckCircle2 : ShieldAlert}
              sub={`阈值 ${formatPercent((result.summary.triggerThresholdPct ?? 0) * 100)}`}
            />
            <StatCard label="总权益" value={formatCurrency(result.summary.totalEquity ?? 0)} />
            <StatCard label="可执行" value={result.summary.executableOrderCount ?? 0} />
            <StatCard
              label="风险信号"
              value={(result.summary.blockedOrderCount ?? 0) + (result.warnings?.length ?? 0)}
              variant={((result.summary.blockedOrderCount ?? 0) + (result.warnings?.length ?? 0)) > 0 ? "warning" : "default"}
              Icon={AlertCircle}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">执行审计矩阵</CardTitle>
              <CardDescription>把可执行与阻断动作放在同一视角，便于判断机会与风险。</CardDescription>
            </CardHeader>
            <CardContent>
              {auditRows.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>状态</TableHead>
                        <TableHead>代码</TableHead>
                        <TableHead>方向</TableHead>
                        <TableHead className="text-right">金额</TableHead>
                        <TableHead>说明</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditRows.map((row, index) => (
                        <TableRow key={`${row.symbol}-${row.side}-${index}`}>
                          <TableCell>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] ${
                                row.tone === "success"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {row.status}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">{row.symbol}</TableCell>
                          <TableCell>
                            <span className={row.side === "BUY" ? "text-emerald-600" : "text-red-600"}>{row.side}</span>
                          </TableCell>
                          <TableCell className="text-right">{formatNotional(row.notional)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">当前没有执行或阻断动作。</div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">规则解释</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                  <span className="text-muted-foreground">防守共识</span>
                  <span className="font-medium">{Number(result.layers?.humanFactor?.defensiveConsensusPct ?? 0).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                  <span className="text-muted-foreground">单笔 NAV 上限</span>
                  <span className="font-medium">{formatPercent(Number(result.layers?.guardrail?.maxOrderPctOfNav ?? 0) * 100)}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                  <span className="text-muted-foreground">单笔流动性上限</span>
                  <span className="font-medium">{formatPercent(Number(result.layers?.guardrail?.maxOrderPctOfLiquidity ?? 0) * 100)}</span>
                </div>
                <div className="rounded-md border px-2 py-2">
                  <div className="mb-1 text-muted-foreground">隔离标的</div>
                  <div className="font-medium">{isolatedSymbols.length ? isolatedSymbols.join(", ") : "无"}</div>
                </div>
                <div className="rounded-md border px-2 py-2">
                  <div className="mb-1 text-muted-foreground">重复风格聚类</div>
                  <div className="font-medium">{duplicatedStyleClusters.length ? duplicatedStyleClusters.join(", ") : "无"}</div>
                </div>
                <div className="rounded-md border px-2 py-2">
                  <div className="mb-1 text-muted-foreground">Risk-off 原因</div>
                  <div className="font-medium">{result.layers?.guardrail?.riskOffReason || "无"}</div>
                </div>
                <div className="rounded-md border px-2 py-2">
                  <div className="mb-1 text-muted-foreground">集中度告警</div>
                  <div className="font-medium">{concentrationWarnings.length ? concentrationWarnings.join("；") : "无"}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">告警列表</CardTitle>
              </CardHeader>
              <CardContent>
                {result.warnings?.length ? (
                  <div className="space-y-1.5">
                    {result.warnings.map((warning, index) => {
                      const tone = warningTone(warning);
                      return (
                        <div
                          key={`warn-${index}`}
                          className={`rounded-md border px-3 py-1.5 text-xs ${
                            tone === "high"
                              ? "border-red-200 bg-red-50/50 text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300"
                              : "border-amber-200 bg-amber-50/50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
                          }`}
                        >
                          {warning}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">暂无告警</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <Button variant="ghost" size="sm" onClick={() => setShowRawRequest(!showRawRequest)} className="text-xs text-muted-foreground">
              {showRawRequest ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
              请求 JSON
            </Button>
            {showRawRequest ? (
              <Card>
                <CardContent className="pt-4">
                  <Textarea readOnly className="min-h-[180px] font-mono text-xs leading-5" value={requestPayload ? prettyJson(requestPayload) : "仅历史运行包含请求快照。"} />
                </CardContent>
              </Card>
            ) : null}

            <Button variant="ghost" size="sm" onClick={() => setShowRawResponse(!showRawResponse)} className="text-xs text-muted-foreground">
              {showRawResponse ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
              响应 JSON
            </Button>
            {showRawResponse ? (
              <Card>
                <CardContent className="pt-4">
                  <Textarea readOnly className="min-h-[180px] font-mono text-xs leading-5" value={prettyJson(result)} />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
