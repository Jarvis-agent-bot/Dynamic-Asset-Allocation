"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { listWorkbenchTradeRecordsV1 } from "@/src/daa/modules/workbench/workbenchApiV1";
import type { WorkbenchTradeRecordsV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

function cycleStatusLabel(status: string): string {
  if (status === "generated") return "已生成";
  if (status === "reviewing") return "审阅中";
  if (status === "executing") return "执行中";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return status;
}

export default function TradesPage() {
  const [data, setData] = useState<WorkbenchTradeRecordsV1>({ cycles: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const next = await listWorkbenchTradeRecordsV1(150);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载交易记录失败");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    function onRefresh() {
      void load(true);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, [load]);

  const orders = useMemo(() => data.orders.slice(0, 300), [data.orders]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="交易记录"
        description="查看再平衡周期与订单执行明细，用于审计与复盘。"
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>交易记录加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}>
          <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "刷新中..." : "刷新"}
        </Button>
      </div>

      <Tabs defaultValue="cycles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cycles">再平衡周期</TabsTrigger>
          <TabsTrigger value="orders">订单明细</TabsTrigger>
        </TabsList>

        <TabsContent value="cycles">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">再平衡周期</CardTitle>
              <CardDescription>每次触发都会创建周期，记录快照、建议与执行结果。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>周期</TableHead>
                      <TableHead>触发</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">交易数</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.cycles.map((cycle) => (
                      <TableRow key={cycle.cycleId}>
                        <TableCell className="font-medium">{cycle.cycleId.slice(0, 8)}</TableCell>
                        <TableCell>{cycle.triggerSource}</TableCell>
                        <TableCell>{cycleStatusLabel(cycle.status)}</TableCell>
                        <TableCell className="text-right tabular-nums">{cycle.executionSummary?.ordersExecuted ?? cycle.executedOrders.length}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(cycle.executionSummary?.totalNotional ?? 0, "USD")}
                        </TableCell>
                        <TableCell>{new Date(cycle.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {!data.cycles.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          暂无再平衡周期记录
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">订单明细</CardTitle>
              <CardDescription>展示交易方向、数量、状态与所属周期。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单号</TableHead>
                      <TableHead>代码</TableHead>
                      <TableHead>方向</TableHead>
                      <TableHead className="text-right">数量</TableHead>
                      <TableHead className="text-right">价格</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>周期</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((row) => (
                      <TableRow key={row.ticketId}>
                        <TableCell className="font-medium">{row.ticketId.slice(0, 8)}</TableCell>
                        <TableCell>{row.symbol}</TableCell>
                        <TableCell className={row.side === "BUY" ? "text-emerald-600" : "text-amber-600"}>
                          {row.side === "BUY" ? "买入" : "卖出"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.qty.toFixed(4)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.price, row.instrumentCurrency)}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.cycleId ? row.cycleId.slice(0, 8) : "-"}</TableCell>
                        <TableCell>{new Date(row.updatedAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {!orders.length ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                          暂无订单记录
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
