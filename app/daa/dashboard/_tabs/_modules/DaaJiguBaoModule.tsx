"use client";

import { useMemo } from "react";

import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Gauge, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";
import { buildJiguBaoModuleReportV1, type JiguBaoActionV1, type JiguBaoValuationSignalV1 } from "@/src/daa/jiguBaoModuleV1";

type Props = {
  request: DaaUnifiedRequestV1 | null;
};

function formatPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function formatMoney(v: number): string {
  if (!(v > 0)) return "-";
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : Math.round(v).toLocaleString();
}

function signalLabel(signal: JiguBaoValuationSignalV1): { text: string; className: string } {
  if (signal === "undervalued") return { text: "低估", className: "text-emerald-600" };
  if (signal === "overvalued") return { text: "高估", className: "text-rose-600" };
  return { text: "中性", className: "text-slate-600" };
}

function actionLabel(action: JiguBaoActionV1): string {
  if (action === "buy_on_dips") return "分批补仓";
  if (action === "trim_rebalance") return "减仓再平衡";
  if (action === "isolate_exit") return "隔离/仅卖出";
  return "继续观察";
}

function momentumLabel(momentum: string): string {
  if (momentum === "strong") return "强";
  if (momentum === "weak") return "弱";
  return "中";
}

function scoreClass(score: number): string {
  if (score >= 66) return "text-emerald-600";
  if (score <= 42) return "text-rose-600";
  return "text-slate-700";
}

export function DaaJiguBaoModule({ request }: Props) {
  const report = useMemo(() => buildJiguBaoModuleReportV1(request), [request]);

  return (
    <Card className="border-violet-100 bg-gradient-to-br from-white via-violet-50/40 to-fuchsia-50/20">
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-violet-600" />
          基估宝模块（估值 + 人因 + 仓位）
        </CardTitle>
        <CardDescription>把“基估宝”估值研判沉淀为统一输入层可复用模块，输出分级动作建议。</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border bg-white px-3 py-2">
            <div className="text-xs text-muted-foreground">覆盖标的</div>
            <div className="text-lg font-semibold">{report.stats.symbolCount}</div>
          </div>
          <div className="rounded-lg border bg-white px-3 py-2">
            <div className="text-xs text-muted-foreground">低估候选</div>
            <div className="text-lg font-semibold text-emerald-600">{report.stats.undervaluedCount}</div>
          </div>
          <div className="rounded-lg border bg-white px-3 py-2">
            <div className="text-xs text-muted-foreground">中性观察</div>
            <div className="text-lg font-semibold text-slate-700">{report.stats.neutralCount}</div>
          </div>
          <div className="rounded-lg border bg-white px-3 py-2">
            <div className="text-xs text-muted-foreground">高估压力</div>
            <div className="text-lg font-semibold text-rose-600">{report.stats.overvaluedCount}</div>
          </div>
          <div className="rounded-lg border bg-white px-3 py-2">
            <div className="text-xs text-muted-foreground">价值陷阱</div>
            <div className="text-lg font-semibold text-amber-600">{report.stats.valueTrapCount}</div>
          </div>
        </div>

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border bg-white px-3 py-2">总权益：{Math.round(report.totalEquity).toLocaleString()}</div>
          <div className="rounded-lg border bg-white px-3 py-2">人因覆盖率：{report.coveragePct.toFixed(1)}%</div>
          <div className="rounded-lg border bg-white px-3 py-2">生成时间：{new Date(report.generatedAt).toLocaleTimeString()}</div>
        </div>

        {report.notes.map((note, idx) => (
          <Alert key={`jigu-note-${idx}`}>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>模块提示</AlertTitle>
            <AlertDescription>{note}</AlertDescription>
          </Alert>
        ))}

        {report.symbols.length ? (
          <div className="rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标的</TableHead>
                  <TableHead className="text-right">当前 / 目标</TableHead>
                  <TableHead className="text-right">偏离</TableHead>
                  <TableHead className="text-right">估值分</TableHead>
                  <TableHead className="text-right">人因分</TableHead>
                  <TableHead className="text-right">动量</TableHead>
                  <TableHead className="text-right">建议</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.symbols.slice(0, 12).map((row) => {
                  const signal = signalLabel(row.valuationSignal);
                  return (
                    <TableRow key={row.symbol}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{row.symbol}</div>
                        <div className="text-xs text-muted-foreground">{row.market}</div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div>{row.currentWeightPct.toFixed(2)}%</div>
                        <div className="text-muted-foreground">{row.targetWeightPct.toFixed(2)}%</div>
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        <span className={row.allocationGapPct >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatPct(row.allocationGapPct)}</span>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className={`font-semibold ${scoreClass(row.valuationScore)}`}>{row.valuationScore.toFixed(1)}</div>
                        <div className={signal.className}>{signal.text}</div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div>{row.humanScorePct.toFixed(1)}</div>
                        <div className="text-muted-foreground">漂移 {row.thesisDriftPct.toFixed(1)}%</div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div>{momentumLabel(row.momentum)}</div>
                        <div className="text-muted-foreground">置信 {row.confidencePct.toFixed(0)}%</div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="inline-flex items-center gap-1">
                          {row.suggestedAction === "buy_on_dips" ? (
                            <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600" />
                          ) : row.suggestedAction === "trim_rebalance" ? (
                            <ArrowDownCircle className="h-3.5 w-3.5 text-rose-600" />
                          ) : row.suggestedAction === "isolate_exit" ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          ) : null}
                          <span>{actionLabel(row.suggestedAction)}</span>
                        </div>
                        <div className="text-muted-foreground">{formatMoney(row.suggestedNotional)}</div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-white px-4 py-6 text-center text-sm text-muted-foreground">暂无可计算标的。</div>
        )}
      </CardContent>
    </Card>
  );
}

export default DaaJiguBaoModule;
