"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Minus, Plus, RefreshCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { getWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchApiV1";
import type { WorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";
import { appendCashLedgerEntryV1, listCashLedgerV1, listEquitySnapshotsV1, type StoreCashLedgerEntryV1, type StoreEquitySnapshotV1 } from "@/src/daa/modules/store/storeApiV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

function dailyPnlFromSnapshots(snapshots: StoreEquitySnapshotV1[], fallbackTotalEquity: number): number {
  if (!snapshots.length) return 0;
  const sorted = [...snapshots].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const latest = sorted[sorted.length - 1]?.totalEquity ?? fallbackTotalEquity;
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2]?.totalEquity ?? latest : latest;
  return latest - previous;
}

function levelClass(level: "info" | "warn" | "success"): string {
  if (level === "warn") return "text-amber-700 bg-amber-50 border-amber-200";
  if (level === "success") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  return "text-sky-700 bg-sky-50 border-sky-200";
}

export default function DaaOverviewPageClient() {
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [snapshots, setSnapshots] = useState<StoreEquitySnapshotV1[]>([]);
  const [cashLedger, setCashLedger] = useState<StoreCashLedgerEntryV1[]>([]);
  const [chartsReady, setChartsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cashDialogSide, setCashDialogSide] = useState<"deposit" | "withdraw" | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [cashSubmitting, setCashSubmitting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [nextBootstrap, nextSnapshots, nextCashLedger] = await Promise.all([
        getWorkbenchBootstrapV1(),
        listEquitySnapshotsV1(120),
        listCashLedgerV1(10),
      ]);
      setBootstrap(nextBootstrap);
      setSnapshots(nextSnapshots);
      setCashLedger(nextCashLedger);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载总览失败");
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

  useEffect(() => {
    setChartsReady(true);
  }, []);

  const cashDialogOpen = cashDialogSide != null;

  const baseCurrency = bootstrap?.baseCurrency || "USD";
  const cashLedgerCurrency = baseCurrency === "USD" || baseCurrency === "CNY" || baseCurrency === "HKD"
    ? baseCurrency
    : "USD";
  const totalEquity = bootstrap?.account.totalEquity ?? 0;
  const holdingsValue = useMemo(
    () => (bootstrap?.assetUniverse || [])
      .filter((row) => row.holdingQty > 0)
      .reduce((sum, row) => sum + (row.valuationBase || 0), 0),
    [bootstrap?.assetUniverse],
  );
  const cashValue = bootstrap?.account.cash ?? 0;
  const dailyPnl = dailyPnlFromSnapshots(snapshots, totalEquity);

  const trendData = useMemo(() => {
    if (!snapshots.length) return [];
    const sorted = [...snapshots]
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .slice(-90);
    return sorted.map((row) => ({
      date: row.ts.slice(5, 10),
      totalEquity: row.totalEquity,
      holdings: row.holdingsValue,
      cash: row.cash,
    }));
  }, [snapshots]);

  const allocationData = useMemo(() => {
    if (!bootstrap) return [];
    const rows = bootstrap.assetUniverse
      .filter((row) => row.holdingQty > 0 && (row.valuationBase || 0) > 0)
      .sort((a, b) => (b.valuationBase || 0) - (a.valuationBase || 0));
    const top = rows.slice(0, 5).map((row) => ({
      name: row.symbol,
      value: row.valuationBase || 0,
    }));
    const topSum = top.reduce((sum, row) => sum + row.value, 0);
    const other = Math.max(0, holdingsValue - topSum);
    return [
      ...top,
      ...(other > 0 ? [{ name: "其他", value: other }] : []),
      ...(cashValue > 0 ? [{ name: "现金", value: cashValue }] : []),
    ];
  }, [bootstrap, holdingsValue, cashValue]);

  async function handleSubmitCashLedger() {
    if (!cashDialogSide || cashSubmitting) return;
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请输入大于 0 的金额");
      return;
    }

    setCashSubmitting(true);
    try {
      await appendCashLedgerEntryV1({
        side: cashDialogSide,
        amount,
        baseCurrency: cashLedgerCurrency,
        note: cashNote.trim() || undefined,
      });
      toast.success(cashDialogSide === "deposit" ? "入金已记录" : "出金已记录");
      setCashDialogSide(null);
      setCashAmount("");
      setCashNote("");
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "现金流水提交失败");
    } finally {
      setCashSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>总览加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-r from-slate-50 via-sky-50 to-cyan-50 p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">组合健康概览</h2>
          <p className="text-sm text-muted-foreground">只读状态面板，聚焦关键指标与提醒。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}>
          <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "刷新中..." : "刷新"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>总权益</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalEquity, baseCurrency)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>持仓市值</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(holdingsValue, baseCurrency)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>现金余额</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(cashValue, baseCurrency)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>今日损益</CardDescription>
            <CardTitle className={`text-2xl ${dailyPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {dailyPnl >= 0 ? "+" : ""}{formatCurrency(dailyPnl, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4" />
            提醒
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(bootstrap?.overviewAlerts || []).length ? (
            (bootstrap?.overviewAlerts || []).map((alert) => (
              <div key={alert.id} className={`rounded-md border px-3 py-2 text-sm ${levelClass(alert.level)}`}>
                {alert.text}
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              暂无重要提醒。
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">权益趋势（90 天）</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="totalEquity" stroke="#0ea5e9" fill="#0ea5e91f" />
                  <Area type="monotone" dataKey="holdings" stroke="#16a34a" fill="#16a34a12" />
                  <Area type="monotone" dataKey="cash" stroke="#f59e0b" fill="#f59e0b12" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">图表加载中...</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">资产配置</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <PieChart>
                  <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} fill="#0284c7" />
                  <Tooltip formatter={(value) => formatCurrency(Number(value || 0), baseCurrency)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">图表加载中...</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">资金流水（最近 10 条）</CardTitle>
            <CardDescription>入金/出金记录用于回顾现金变化。</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCashDialogSide("deposit")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              入金
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCashDialogSide("withdraw")}
            >
              <Minus className="mr-1.5 h-3.5 w-3.5" />
              出金
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/daa/dashboard/workbench">前往工作台</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/daa/dashboard/trades">查看交易记录</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cashLedger || []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.ts).toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={row.side === "deposit" ? "text-emerald-600" : "text-amber-600"}>
                        {row.side === "deposit" ? "入金" : "出金"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.amount, row.baseCurrency)}</TableCell>
                    <TableCell>{row.note || "-"}</TableCell>
                  </TableRow>
                ))}
                {!cashLedger.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      <CheckCircle2 className="mx-auto mb-2 h-4 w-4" />
                      暂无资金流水记录
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={cashDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCashDialogSide(null);
            setCashAmount("");
            setCashNote("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{cashDialogSide === "withdraw" ? "记录出金" : "记录入金"}</DialogTitle>
            <DialogDescription>仅记录资金流水并更新现金余额，不会触发自动交易。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>金额（{cashLedgerCurrency}）</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cashAmount}
                onChange={(event) => setCashAmount(event.target.value)}
                placeholder={`请输入${cashLedgerCurrency}金额`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>备注（可选）</Label>
              <Input
                value={cashNote}
                onChange={(event) => setCashNote(event.target.value)}
                placeholder="例如：工资入账 / 提现"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCashDialogSide(null);
                setCashAmount("");
                setCashNote("");
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleSubmitCashLedger()} disabled={cashSubmitting}>
              {cashSubmitting ? "提交中..." : "确认提交"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          总览数据加载中...
        </div>
      ) : null}
    </div>
  );
}
