"use client";

import { useMemo, useState } from "react";

import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import type { TradeTicketV1 } from "@/src/daa/modules/trade/tradeTypesV1";
import type { WorkbenchRecommendationV1, WorkbenchRecommendationsResultV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

function statusLabel(status: string): string {
  if (status === "executed") return "已执行";
  if (status === "rejected") return "已拒单";
  if (status === "canceled") return "已取消";
  return "待执行";
}

function statusClass(status: string): string {
  if (status === "executed") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-red-100 text-red-700";
  if (status === "canceled") return "bg-muted text-muted-foreground";
  return "bg-amber-100 text-amber-700";
}

export default function ExecutionPanel(props: {
  baseCurrency: string;
  analysisFocus: string;
  onAnalysisFocusChange: (next: string) => void;
  onRunRecommendations: () => void;
  onAddRecommendation: (row: WorkbenchRecommendationV1) => void;
  onAddAllRecommendations: () => void;
  runningRecommendations?: boolean;
  recommendations: WorkbenchRecommendationsResultV1 | null;
  queueId: string | null;
  queueItems: TradeTicketV1[];
  logs: TradeTicketV1[];
  committing?: boolean;
  disabled?: boolean;
  onCommit: () => Promise<void>;
}) {
  const [showLogs, setShowLogs] = useState(false);

  const queueNotional = useMemo(() => {
    return props.queueItems.reduce((sum, row) => sum + (row.notionalInBase || 0), 0);
  }, [props.queueItems]);

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">建议与执行</CardTitle>
        <CardDescription>建议生成、加入执行队列、批量执行与结果追溯在同一处完成。</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border p-3">
          <div className="text-xs font-medium text-muted-foreground">分析关注点</div>
          <div className="flex gap-2">
            <Input
              value={props.analysisFocus}
              onChange={(event) => props.onAnalysisFocusChange(event.target.value)}
              placeholder="例如：控制回撤并优先保留高质量资产"
              className="h-8 text-xs"
              disabled={props.disabled || props.runningRecommendations}
            />
            <Button size="sm" onClick={props.onRunRecommendations} disabled={props.disabled || props.runningRecommendations}>
              {props.runningRecommendations ? "分析中..." : "生成建议"}
            </Button>
          </div>

          {props.recommendations ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <div>
                可执行 {props.recommendations.summary.executableOrderCount} 条 · 阻断 {props.recommendations.summary.blockedOrderCount} 条 · 账户估值 {formatCurrency(props.recommendations.summary.totalEquity, props.recommendations.summary.baseCurrency)}
              </div>
              {props.recommendations.warnings.length > 0 ? (
                <div className="mt-1">风险提示：{props.recommendations.warnings.join("、")}</div>
              ) : null}
            </div>
          ) : null}

          {props.recommendations?.insightDigest?.topOpportunities?.length ? (
            <div className="rounded-md border p-2 text-xs text-muted-foreground">
              <div className="mb-1 text-foreground">机会摘要（中文）</div>
              {props.recommendations.insightDigest.topOpportunities.map((item) => (
                <div key={`opp-${item.symbol}`} className="mb-1">
                  {item.symbol} · {item.actionLabelZh} · 评分 {item.finalScorePct.toFixed(1)} · {item.reasonZh}
                </div>
              ))}
            </div>
          ) : null}

          {props.recommendations?.recommendations?.length ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">建议列表</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={props.onAddAllRecommendations}
                  disabled={props.disabled}
                >
                  一键加入执行
                </Button>
              </div>
              <div className="max-h-56 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>标的</TableHead>
                      <TableHead>方向</TableHead>
                      <TableHead className="text-right">建议金额</TableHead>
                      <TableHead>动作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.recommendations.recommendations.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.symbol}</div>
                          <div className="text-xs text-muted-foreground">{row.market} · {row.currency}</div>
                        </TableCell>
                        <TableCell>
                          <span className={row.side === "BUY" ? "text-emerald-600" : "text-red-600"}>{row.side === "BUY" ? "买入" : "卖出"}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.suggestedNotional, props.baseCurrency)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{row.actionLabelZh}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => props.onAddRecommendation(row)}
                              disabled={props.disabled}
                            >
                              加入执行
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">执行队列</div>
              <div className="text-xs text-muted-foreground">
                队列ID：<span className="font-mono">{props.queueId || "-"}</span> · 待执行 {props.queueItems.length} 条 · 预计金额 {formatCurrency(queueNotional, props.baseCurrency)}
              </div>
            </div>
            <Button onClick={() => void props.onCommit()} disabled={props.disabled || props.committing || props.queueItems.length <= 0}>
              {props.committing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {props.committing ? "执行中..." : `执行(${props.queueItems.length})`}
            </Button>
          </div>

          {props.queueItems.length ? (
            <div className="max-h-44 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>标的</TableHead>
                    <TableHead>方向</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">价格</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.queueItems.map((row) => (
                    <TableRow key={row.ticketId}>
                      <TableCell>
                        <div className="font-medium">{row.symbol}</div>
                        <div className="text-xs text-muted-foreground">{row.market} · {row.instrumentCurrency}</div>
                      </TableCell>
                      <TableCell className={row.side === "BUY" ? "text-emerald-600" : "text-red-600"}>{row.side === "BUY" ? "买入" : "卖出"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.qty.toFixed(6)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.price.toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">当前无待执行订单。</div>
          )}
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowLogs((prev) => !prev)}
          >
            <span className="text-sm font-medium">执行结果</span>
            <span className="inline-flex items-center text-xs text-muted-foreground">
              最近 {props.logs.length} 条
              {showLogs ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
            </span>
          </button>

          {showLogs ? (
            props.logs.length ? (
              <div className="max-h-60 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>时间</TableHead>
                      <TableHead>标的</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.logs.map((row) => {
                      const ts = row.executedAt || row.canceledAt || row.updatedAt || row.createdAt;
                      const message = row.rejectMessage || row.rejectCode || row.reasonText || "-";
                      return (
                        <TableRow key={`log-${row.ticketId}`}>
                          <TableCell className="text-xs text-muted-foreground">{new Date(ts).toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="font-medium">{row.symbol}</div>
                            <div className="text-xs text-muted-foreground">{row.side === "BUY" ? "买入" : "卖出"} · {row.qty.toFixed(4)}</div>
                          </TableCell>
                          <TableCell>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{message}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">暂无执行记录。</div>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
