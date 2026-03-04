"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, DollarSign, PieChart, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart as RechartsPieChart, Tooltip, XAxis, YAxis } from "recharts";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import { fetchDaaAuthSessionV1, type DaaAuthMeResponseV1 } from "@/app/daa/_components/daaAuthSessionClientV1";
import { getWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchApiV1";
import type { WorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";
import {
  appendCashLedgerEntryV1,
  listCashLedgerV1,
  listEquitySnapshotsV1,
  type StoreCashLedgerEntryV1,
  type StoreEquitySnapshotV1,
} from "@/src/daa/modules/store/storeApiV1";
import { formatCurrency } from "./daaFormatters";

type AuthModel =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "error"; message: string }
  | { kind: "signedIn"; me: Extract<DaaAuthMeResponseV1, { ok: true }> };

const CASH_LEDGER_CURRENCY_OPTIONS = ["USD", "CNY", "HKD"] as const;
const ASSET_CHART_COLORS = ["#8b5cf6", "#06b6d4", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444", "#64748b"] as const;
const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";

function emitDashboardDataUpdatedV1() {
  try {
    window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }));
  } catch {
    // ignore browser event failures
  }
}

function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return fallback;
  if (text === "RMB" || text === "CNH") return "CNY";
  return text;
}

function DaaAssetsHeader() {
  return (
    <div className="space-y-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/daa/dashboard">DAA</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>资产首页</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="资产首页" description={<>优先管理资产、资金流水与资产结构，可直接完成入金/出金和持仓视图分析。</>} />
    </div>
  );
}

function SignedOutState({ returnTo }: { returnTo: string }) {
  return (
    <Card className="border-muted-foreground/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">需要登录</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">当前会话不可用，请先登录。</div>
        <Button asChild>
          <Link href={`/daa/login?returnTo=${encodeURIComponent(returnTo)}`}>去登录</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <Card className="border-muted-foreground/20" role="status" aria-live="polite" aria-busy="true">
      <CardContent className="space-y-3 py-6">
        <span className="sr-only">Loading DAA assets</span>
        <Skeleton className="h-5 w-[220px]" />
        <Skeleton className="h-4 w-[420px]" />
        <Skeleton className="h-9 w-[120px]" />
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/20" role="alert" aria-live="assertive">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">会话检查失败</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">{message}</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onRetry}>
            重试
          </Button>
          <Button asChild type="button" variant="secondary">
            <Link href="/daa/login?returnTo=%2Fdaa%2Fdashboard">重新登录</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CashFlowDialog({
  title,
  side,
  submitting,
  maxCash,
  defaultCurrency,
  onSubmit,
}: {
  title: string;
  side: "deposit" | "withdraw";
  submitting: boolean;
  maxCash: number;
  defaultCurrency: string;
  onSubmit: (input: { amount: number; baseCurrency: "USD" | "CNY" | "HKD"; note?: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [baseCurrency, setBaseCurrency] = useState<"USD" | "CNY" | "HKD">("USD");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (defaultCurrency === "CNY" || defaultCurrency === "HKD" || defaultCurrency === "USD") {
      setBaseCurrency(defaultCurrency);
      return;
    }
    setBaseCurrency("USD");
  }, [defaultCurrency]);

  function resetForm() {
    setAmount("");
    setNote("");
    setError("");
  }

  async function handleSubmit() {
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("请输入大于 0 的金额。");
      return;
    }
    if (side === "withdraw" && amountNum > maxCash + 1e-9) {
      setError(`可用现金不足，当前余额 ${maxCash.toFixed(2)} ${baseCurrency}`);
      return;
    }

    setError("");
    try {
      await onSubmit({
        amount: amountNum,
        baseCurrency,
        note: note.trim() || undefined,
      });
      setOpen(false);
      resetForm();
    } catch {
      // keep dialog open for user corrections
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={side === "deposit" ? "default" : "outline"} size="sm" disabled={submitting}>
          {side === "deposit" ? <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" /> : <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />}
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {side === "deposit" ? "记录入金流水并同步更新现金余额与权益快照。" : "记录出金流水并同步更新现金余额与权益快照。"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="space-y-1.5">
            <Label>金额（{baseCurrency}）</Label>
            <Input value={amount} type="number" min="0" step="0.01" onChange={(e) => setAmount(e.target.value)} placeholder="1000" />
          </div>
          <div className="space-y-1.5">
            <Label>币种</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value as "USD" | "CNY" | "HKD")}
            >
              {CASH_LEDGER_CURRENCY_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>备注（可选）</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="本次记录说明" />
          </div>
        </div>

        {error ? <div className="text-xs text-destructive">{error}</div> : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>{submitting ? "提交中..." : "确认"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DaaAssetsPageClient() {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");

  useEffect(() => {
    const n = String(notice || "").trim();
    if (n === "signed_in") {
      toast.success("登录成功");
    }

    try {
      const url = new URL(window.location.href);
      let changed = false;

      if (url.searchParams.has("notice")) {
        url.searchParams.delete("notice");
        changed = true;
      }

      if (url.searchParams.has("tab")) {
        url.searchParams.delete("tab");
        changed = true;
      }

      if (changed) {
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, "", next);
      }
    } catch {
      // ignore
    }
  }, [notice]);

  const [auth, setAuth] = useState<AuthModel>({ kind: "loading" });
  const [authRev, setAuthRev] = useState(0);
  const [cashSubmitting, setCashSubmitting] = useState<"idle" | "deposit" | "withdraw">("idle");
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [snapshots, setSnapshots] = useState<StoreEquitySnapshotV1[]>([]);
  const [ledgerRows, setLedgerRows] = useState<StoreCashLedgerEntryV1[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const [dataError, setDataError] = useState("");
  const [equityChartWidth, setEquityChartWidth] = useState(0);
  const [allocationChartWidth, setAllocationChartWidth] = useState(0);

  const authRefreshInFlightRef = useRef(false);
  const lastAuthRefreshAtRef = useRef(0);
  const equityChartHostRef = useRef<HTMLDivElement | null>(null);
  const allocationChartHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const compute = () => {
      const equityWidth = Math.max(0, Math.floor(equityChartHostRef.current?.getBoundingClientRect().width ?? 0));
      const allocationWidth = Math.max(0, Math.floor(allocationChartHostRef.current?.getBoundingClientRect().width ?? 0));
      setEquityChartWidth(equityWidth);
      setAllocationChartWidth(allocationWidth);
    };

    compute();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => compute());
      if (equityChartHostRef.current) observer.observe(equityChartHostRef.current);
      if (allocationChartHostRef.current) observer.observe(allocationChartHostRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  useEffect(() => {
    function requestRefresh() {
      const now = Date.now();
      if (authRefreshInFlightRef.current) return;
      if (now - lastAuthRefreshAtRef.current < 2500) return;

      lastAuthRefreshAtRef.current = now;
      authRefreshInFlightRef.current = true;
      setAuthRev((x) => x + 1);
    }

    function onFocus() {
      requestRefresh();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") requestRefresh();
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const returnTo = useMemo(() => {
    if (typeof window === "undefined") return "/daa/dashboard";
    return `${window.location.pathname}${window.location.search}`;
  }, [authRev]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      authRefreshInFlightRef.current = true;
      lastAuthRefreshAtRef.current = Date.now();

      try {
        const result = await fetchDaaAuthSessionV1({
          silent: true,
          force: true,
          cacheTtlMs: 0,
        });
        if (cancelled) return;

        if (result.kind === "signedOut") {
          setAuth({ kind: "signedOut" });
          return;
        }
        if (result.kind === "error") {
          setAuth({ kind: "error", message: result.message || "会话检查失败" });
          return;
        }
        setAuth({ kind: "signedIn", me: result.me });
      } catch (e) {
        if (cancelled) return;
        setAuth({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        authRefreshInFlightRef.current = false;
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [authRev]);

  const loadRuntimeData = useMemo(
    () =>
      async (opts?: { silent?: boolean }) => {
        const silent = Boolean(opts?.silent);
        if (silent) setDataRefreshing(true);
        else setDataLoading(true);
        setDataError("");

        try {
          const [nextBootstrap, nextSnapshots, nextLedger] = await Promise.all([
            getWorkbenchBootstrapV1(),
            listEquitySnapshotsV1(200),
            listCashLedgerV1(100),
          ]);
          setBootstrap(nextBootstrap);
          setSnapshots(Array.isArray(nextSnapshots) ? nextSnapshots : []);
          setLedgerRows(Array.isArray(nextLedger) ? nextLedger : []);
          emitDashboardDataUpdatedV1();
        } catch (error) {
          setDataError(getApiErrorMessageV1(error));
        } finally {
          if (silent) setDataRefreshing(false);
          else setDataLoading(false);
        }
      },
    [],
  );

  useEffect(() => {
    if (auth.kind !== "signedIn") return;
    void loadRuntimeData({ silent: false });
  }, [auth.kind, loadRuntimeData]);

  useEffect(() => {
    if (auth.kind !== "signedIn") return;
    function onRefresh() {
      void loadRuntimeData({ silent: true });
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, [auth.kind, loadRuntimeData]);

  const header = <DaaAssetsHeader />;

  if (auth.kind === "loading") {
    return (
      <div className="space-y-4">
        {header}
        <LoadingState />
      </div>
    );
  }

  if (auth.kind === "signedOut") {
    return (
      <div className="space-y-4">
        {header}
        <SignedOutState returnTo={returnTo} />
      </div>
    );
  }

  if (auth.kind === "error") {
    return (
      <div className="space-y-4">
        {header}
        <ErrorState message={auth.message} onRetry={() => setAuthRev((x) => x + 1)} />
      </div>
    );
  }

  const assetRows = bootstrap?.assetUniverse ?? [];
  const cash = Math.max(0, Number(bootstrap?.account.cash ?? 0));
  const displayCurrency = normalizeCcyCode(bootstrap?.baseCurrency ?? "USD", "USD");
  const positionValuations = assetRows
    .filter((row) => row.holdingQty > 0)
    .map((row) => ({
      symbol: row.symbol,
      market: row.market,
      baseValue: row.valuationBase == null ? null : Math.max(0, Number(row.valuationBase) || 0),
      fxMissing: Boolean(row.fxMissing),
    }));
  const holdingsValue = positionValuations.reduce((sum, row) => sum + (row.baseValue ?? 0), 0);
  const unresolvedFxCount = positionValuations.filter((row) => row.fxMissing).length;
  const defaultCashLedgerCurrency: "USD" | "CNY" | "HKD" = displayCurrency === "HKD"
    ? "HKD"
    : displayCurrency === "CNY" || displayCurrency === "RMB"
      ? "CNY"
      : "USD";
  const totalEquity = bootstrap?.account.totalEquity ?? holdingsValue + cash;

  const dayDelta = snapshots[0] && snapshots[1]
    ? Number(snapshots[0].totalEquity || 0) - Number(snapshots[1].totalEquity || 0)
    : null;

  const equityTrendRows = (() => {
    const rows = snapshots
      .slice(0, 90)
      .reverse()
      .map((row) => ({
        ts: new Date(row.ts).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
        equity: Number(row.totalEquity || 0),
        holdings: Number(row.holdingsValue || 0),
        cash: Number(row.cash || 0),
      }));
    if (rows.length) return rows;
    return [
      {
        ts: new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
        equity: totalEquity,
        holdings: holdingsValue,
        cash,
      },
    ];
  })();

  const allocationRows = (() => {
    const rawRows = positionValuations
      .map((row) => ({
        name: `${row.symbol} (${row.market})`,
        value: Math.max(0, row.baseValue ?? 0),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);

    const topRows = rawRows.slice(0, 6);
    const othersValue = rawRows.slice(6).reduce((sum, row) => sum + row.value, 0);
    const rows = [...topRows];
    if (othersValue > 0) rows.push({ name: "其他持仓", value: othersValue });
    if (cash > 0) rows.push({ name: "现金", value: cash });

    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return rows.map((row, index) => ({
      ...row,
      pct: total > 0 ? (row.value / total) * 100 : 0,
      color: ASSET_CHART_COLORS[index % ASSET_CHART_COLORS.length],
    }));
  })();

  async function handleCashChange(
    side: "deposit" | "withdraw",
    input: { amount: number; baseCurrency: "USD" | "CNY" | "HKD"; note?: string },
  ) {
    setCashSubmitting(side);
    try {
      await appendCashLedgerEntryV1({
        side,
        amount: input.amount,
        baseCurrency: input.baseCurrency,
        note: input.note,
      });
      toast.success(side === "deposit" ? "入金记录成功" : "出金记录成功");
      await loadRuntimeData({ silent: true });
    } catch (e) {
      toast.error(getApiErrorMessageV1(e));
      throw e;
    } finally {
      setCashSubmitting("idle");
    }
  }

  return (
    <div className="space-y-4">
      {header}

      {dataError ? (
        <Alert variant="destructive">
          <AlertTitle>资产数据加载失败</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      ) : null}

      {dataLoading && !bootstrap ? <LoadingState /> : null}

      {dataRefreshing ? <div className="text-xs text-muted-foreground">资产数据刷新中...</div> : null}

      {bootstrap ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">总权益</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatCurrency(totalEquity, displayCurrency)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">持仓市值</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatCurrency(holdingsValue, displayCurrency)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">现金余额</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatCurrency(cash, displayCurrency)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">最近权益变动</CardTitle>
          </CardHeader>
          <CardContent className={`text-xl font-semibold ${dayDelta != null && dayDelta < 0 ? "text-red-600" : ""}`}>
            {dayDelta == null ? "-" : `${dayDelta >= 0 ? "+" : ""}${formatCurrency(dayDelta, displayCurrency)}`}
          </CardContent>
        </Card>
          </div>

          {unresolvedFxCount > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>汇率缺失提示</AlertTitle>
              <AlertDescription>
                有 {unresolvedFxCount} 个持仓缺少汇率，当前持仓市值与资产占比仅统计可换算资产。请到系统设置补齐 FX 快照。
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" />资产流水图</CardTitle>
            <CardDescription>展示权益、持仓市值与现金的时间变化。</CardDescription>
          </CardHeader>
          <CardContent>
            <div ref={equityChartHostRef} className="h-[220px] w-full min-h-[220px] min-w-0">
              {equityChartWidth > 0 ? (
                <AreaChart width={equityChartWidth} height={220} data={equityTrendRows} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="ts" fontSize={11} />
                  <YAxis fontSize={11} width={46} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === "equity") return [formatCurrency(Number(value || 0), displayCurrency), "总权益"];
                      if (name === "holdings") return [formatCurrency(Number(value || 0), displayCurrency), "持仓市值"];
                      return [formatCurrency(Number(value || 0), displayCurrency), "现金"];
                    }}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={1.6} />
                  <Area type="monotone" dataKey="holdings" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={1.2} />
                  <Area type="monotone" dataKey="cash" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={1.2} />
                </AreaChart>
              ) : (
                <Skeleton className="h-full w-full" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><PieChart className="h-4 w-4" />资产占比图</CardTitle>
            <CardDescription>按持仓和现金展示当前资产结构。</CardDescription>
          </CardHeader>
          <CardContent>
            {allocationRows.length ? (
              <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                <div ref={allocationChartHostRef} className="h-[220px] w-full min-h-[220px] min-w-0">
                  {allocationChartWidth > 0 ? (
                    <RechartsPieChart width={allocationChartWidth} height={220}>
                      <Pie data={allocationRows} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                        {allocationRows.map((entry) => (
                          <Cell key={`asset-slice-${entry.name}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value || 0), displayCurrency)} />
                    </RechartsPieChart>
                  ) : (
                    <Skeleton className="h-full w-full" />
                  )}
                </div>
                <div className="space-y-1.5 text-xs">
                  {allocationRows.map((row) => (
                    <div key={`asset-legend-${row.name}`} className="flex items-center justify-between rounded border px-2 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                        {row.name}
                      </span>
                      <span className="text-muted-foreground">
                        {row.pct.toFixed(1)}% · {formatCurrency(row.value, displayCurrency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">暂无资产占比数据，请先新增持仓或入金。</div>
            )}
          </CardContent>
        </Card>
          </div>

          <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">资金流水（模拟）</CardTitle>
          <CardDescription>按交易所入金/出金逻辑记录，自动更新账户现金与权益快照。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <CashFlowDialog
              title="入金"
              side="deposit"
              maxCash={cash}
              defaultCurrency={defaultCashLedgerCurrency}
              submitting={cashSubmitting !== "idle"}
              onSubmit={(input) => handleCashChange("deposit", input)}
            />
            <CashFlowDialog
              title="出金"
              side="withdraw"
              maxCash={cash}
              defaultCurrency={defaultCashLedgerCurrency}
              submitting={cashSubmitting !== "idle"}
              onSubmit={(input) => handleCashChange("withdraw", input)}
            />
            <Button asChild variant="outline" size="sm">
              <Link href="/daa/dashboard/portfolio?view=holdings">交易工作台（持仓）</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/daa/dashboard/strategy-lab">策略实验室</Link>
            </Button>
          </div>

          {ledgerRows.length ? (
            <div className="overflow-x-auto rounded-lg border">
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
                  {ledgerRows.slice(0, 12).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(entry.ts).toLocaleString()}</TableCell>
                      <TableCell className={entry.side === "deposit" ? "text-emerald-600" : "text-amber-600"}>
                        {entry.side === "deposit" ? "入金" : "出金"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(entry.amount, entry.baseCurrency)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.note || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">暂无资金流水，建议先记录一笔入金。</div>
          )}
        </CardContent>
          </Card>

          <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><DollarSign className="h-4 w-4" />资产运营说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          资产首页聚焦“资金、仓位、结构图表、执行入口”，减少流程跳转与冗余配置，方便按交易所节奏做记录与复盘。
        </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
