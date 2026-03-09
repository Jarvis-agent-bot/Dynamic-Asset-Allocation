"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Minus, Plus, RefreshCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { getWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchApiV1";
import type { WorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";
import {
  appendCashLedgerEntryV1,
  listCashLedgerV1,
  listEquitySnapshotsV1,
  listMarketIndicatorHistoryV1,
  refreshMarketIndicatorsV1,
  type StoreCashLedgerEntryV1,
  type StoreEquitySnapshotV1,
} from "@/src/daa/modules/store/storeApiV1";
import {
  MARKET_INDICATOR_KEYS_BY_SCOPE_V1,
  MARKET_SCOPE_KEY_ORDER_V1,
  MARKET_SCOPE_LABEL_ZH_V1,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalogV1";
import type { DaaMarketIndicatorKeyV1, DaaMarketIndicatorScopeV1 } from "@/src/daa/modules/marketContext/marketContextTypesV1";

import { DeepLedgerActionButton, DeepLedgerMetricCard, DeepLedgerPageHeader, DeepLedgerPanel, DeepLedgerStatusPill, type DeepLedgerTone, toneColor } from "./DeepLedgerUI";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const PIE_COLORS = ["#38BDF8", "#818CF8", "#F6AD55", "#34D399", "#F87171", "#A78BFA", "#6EE7B7"];
const MARKET_INDICATOR_LINE_META_V1: Record<DaaMarketIndicatorKeyV1, { label: string; color: string }> = {
  vix: { label: "VIX", color: "#38BDF8" },
  qqq_spy_ratio: { label: "QQQ/SPY", color: "#818CF8" },
  fxi_volatility: { label: "FXI 波动率", color: "#F87171" },
  kweb_fxi_ratio: { label: "KWEB/FXI", color: "#F6AD55" },
  btc_eth_ratio: { label: "BTC/ETH", color: "#34D399" },
  btc_volatility: { label: "BTC 波动率", color: "#A78BFA" },
  gold_silver_ratio: { label: "金银比", color: "#FBBF24" },
};

const CASH_CURRENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "USD", label: "美元 (USD)" },
  { value: "EUR", label: "欧元 (EUR)" },
  { value: "USDC", label: "稳定币 (USDC)" },
  { value: "RMB", label: "人民币 (RMB/CNY)" },
  { value: "HKD", label: "港元 (HKD)" },
];

function normalizeCashCurrency(value: string): string {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "RMB" || raw === "CNH") return "CNY";
  return raw || "USD";
}

function dailyPnlFromSnapshots(snapshots: StoreEquitySnapshotV1[], fallbackTotalEquity: number): number {
  if (!snapshots.length) return 0;
  const sorted = [...snapshots].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const latest = sorted[sorted.length - 1]?.totalEquity ?? fallbackTotalEquity;
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2]?.totalEquity ?? latest : latest;
  return latest - previous;
}

function formatCurrencyCompact(value: number, currency = "USD") {
  if (!Number.isFinite(value)) return formatCurrency(0, currency);
  const normalized = String(currency || "USD").trim().toUpperCase();
  const displayCurrency = normalized === "RMB" ? "CNY" : normalized;
  try {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: displayCurrency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
  } catch {
    return formatCurrency(value, currency);
  }
}

function OverviewChartFrame({
  height,
  children,
}: {
  height: number;
  children: (size: { width: number; height: number }) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => setWidth(Math.max(0, Math.floor(node.getBoundingClientRect().width)));
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 ? children({ width, height }) : null}
    </div>
  );
}

function alertTone(level: "info" | "warn" | "success") {
  if (level === "warn") return "amber" as const;
  if (level === "success") return "green" as const;
  return "cyan" as const;
}

function marketRegimeTone(regime: WorkbenchBootstrapV1["marketContext"] extends infer T ? T extends { regime: infer R } ? R : never : never) {
  if (regime === "risk_off") return "amber" as const;
  if (regime === "risk_on") return "green" as const;
  return "indigo" as const;
}

function marketRegimeLabel(regime: string | null | undefined) {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
}

function formatIndicatorValue(value: number | null | undefined, unit?: string) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function marketPercentileTextV1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "近一年位置 N/A";
  const zone = value >= 80 ? "极高"
    : value >= 60 ? "偏高"
    : value > 40 ? "中性"
    : value > 20 ? "偏低"
    : "极低";
  return `近一年位置 ${value.toFixed(1)}%（${zone}）`;
}

function shortDateLabelV1(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  const date = new Date(ms);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildMarketHistoryChartDataV1(
  history: Partial<Record<DaaMarketIndicatorKeyV1, Array<{ generatedAt: string; riskOffScorePct: number }>>>,
  order: DaaMarketIndicatorKeyV1[],
): Array<Record<string, number | string | null>> {
  const byDay = new Map<string, Record<string, number | string | null>>();

  for (const key of order) {
    const rows = Array.isArray(history[key]) ? history[key] : [];
    const latestByDay = new Map<string, { generatedAt: string; riskOffScorePct: number }>();
    for (const row of rows) {
      const day = String(row.generatedAt || "").slice(0, 10);
      if (!day) continue;
      const existing = latestByDay.get(day);
      if (!existing || String(existing.generatedAt) < String(row.generatedAt)) {
        latestByDay.set(day, row);
      }
    }
    for (const [day, row] of latestByDay.entries()) {
      const current = byDay.get(day) || { day, label: shortDateLabelV1(day) };
      current[key] = Number.isFinite(row.riskOffScorePct) ? Number(row.riskOffScorePct.toFixed(2)) : null;
      byDay.set(day, current);
    }
  }

  return [...byDay.values()]
    .sort((a, b) => String(a.day).localeCompare(String(b.day)))
    .map((row) => {
      const next: Record<string, number | string | null> = { ...row };
      for (const key of order) {
        if (!(key in next)) next[key] = null;
      }
      return next;
    });
}

function shortRefLabelV1(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function buildCashLedgerAmountViewV1(row: StoreCashLedgerEntryV1): { primary: string; secondary: string | null } {
  const primary = formatCurrency(row.amount, row.baseCurrency);
  const normalizedAmount = row.amountInAccountBase;
  const normalizedCurrency = row.accountBaseCurrency;
  if (normalizedAmount == null || !normalizedCurrency) {
    return { primary, secondary: null };
  }
  const sameCurrency = normalizedCurrency === row.baseCurrency;
  const sameAmount = Math.abs(normalizedAmount - row.amount) < 1e-6;
  if (sameCurrency && sameAmount) {
    return { primary, secondary: null };
  }
  return {
    primary,
    secondary: `折算 ${formatCurrency(normalizedAmount, normalizedCurrency)}`,
  };
}

function buildCashLedgerMetaV1(row: StoreCashLedgerEntryV1): string[] {
  const meta: string[] = [];
  if (row.entryKind === "trade_execution") meta.push("交易执行");
  else if (row.entryKind === "manual") meta.push("手工记账");

  const ticketId = shortRefLabelV1(row.ticketId);
  if (ticketId) meta.push(`Ticket ${ticketId}`);

  const cycleId = shortRefLabelV1(row.cycleId);
  if (cycleId) meta.push(`Cycle ${cycleId}`);

  if (row.settlementTs) {
    meta.push(`结算 ${new Date(row.settlementTs).toLocaleString()}`);
  }
  return meta;
}

function cashLedgerSideLabelV1(row: StoreCashLedgerEntryV1): string {
  if (row.entryKind === "trade_execution") {
    return row.side === "deposit" ? "卖出回款" : "买入扣款";
  }
  return row.side === "deposit" ? "入金" : "出金";
}

export default function DaaOverviewPageClient() {
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [snapshots, setSnapshots] = useState<StoreEquitySnapshotV1[]>([]);
  const [cashLedger, setCashLedger] = useState<StoreCashLedgerEntryV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cashDialogSide, setCashDialogSide] = useState<"deposit" | "withdraw" | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashCurrency, setCashCurrency] = useState("USD");
  const [cashNote, setCashNote] = useState("");
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [marketHistoryRange, setMarketHistoryRange] = useState<30 | 90>(30);
  const [selectedMarketScope, setSelectedMarketScope] = useState<DaaMarketIndicatorScopeV1>("us_equity");
  const [marketHistoryLoading, setMarketHistoryLoading] = useState(true);
  const [marketHistoryRefreshing, setMarketHistoryRefreshing] = useState(false);
  const [marketHistoryError, setMarketHistoryError] = useState("");
  const [marketHistoryData, setMarketHistoryData] = useState<Array<Record<string, number | string | null>>>([]);
  const [marketContextRefreshing, setMarketContextRefreshing] = useState(false);
  const marketScopes = useMemo(
    () => MARKET_SCOPE_KEY_ORDER_V1.filter((scope) => Boolean(bootstrap?.marketContext?.scopes?.some((item) => item.scope === scope))),
    [bootstrap],
  );
  const selectedScope = marketScopes.includes(selectedMarketScope)
    ? selectedMarketScope
    : (marketScopes[0] || "us_equity");
  const selectedScopeContext = bootstrap?.marketContext?.scopes?.find((item) => item.scope === selectedScope) || null;
  const selectedScopeKeys = MARKET_INDICATOR_KEYS_BY_SCOPE_V1[selectedScope] || [];

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [bootstrapResult, snapshotResult, ledgerResult] = await Promise.all([
        getWorkbenchBootstrapV1(),
        listEquitySnapshotsV1(120),
        listCashLedgerV1(10),
      ]);
      setBootstrap(bootstrapResult);
      setSnapshots(snapshotResult);
      setCashLedger(ledgerResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载总览失败");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const loadMarketHistory = useCallback(async (days: 30 | 90, scope: DaaMarketIndicatorScopeV1, silent = false) => {
    if (silent) setMarketHistoryRefreshing(true);
    else setMarketHistoryLoading(true);
    setMarketHistoryError("");
    try {
      const keys = MARKET_INDICATOR_KEYS_BY_SCOPE_V1[scope] || [];
      const result = await listMarketIndicatorHistoryV1({ keys, days, scope });
      setMarketHistoryData(buildMarketHistoryChartDataV1(result.history, keys));
    } catch (e) {
      setMarketHistoryError(e instanceof Error ? e.message : "加载市场历史失败");
    } finally {
      if (silent) setMarketHistoryRefreshing(false);
      else setMarketHistoryLoading(false);
    }
  }, []);

  const handleRefreshMarketContext = useCallback(async () => {
    setMarketContextRefreshing(true);
    try {
      const result = await refreshMarketIndicatorsV1();
      toast.success(`市场状态层已刷新，更新 ${result.refreshedCount} 项指标`);
      await Promise.all([
        load(true),
        loadMarketHistory(marketHistoryRange, selectedScope, true),
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "刷新市场状态层失败";
      toast.error(message);
    } finally {
      setMarketContextRefreshing(false);
    }
  }, [load, loadMarketHistory, marketHistoryRange, selectedScope]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    void loadMarketHistory(marketHistoryRange, selectedScope, false);
  }, [loadMarketHistory, marketHistoryRange, selectedScope]);

  useEffect(() => {
    function onRefresh() {
      void Promise.all([
        load(true),
        loadMarketHistory(marketHistoryRange, selectedScope, true),
      ]);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, [load, loadMarketHistory, marketHistoryRange, selectedScope]);

  useEffect(() => {
    if (marketScopes.length > 0 && !marketScopes.includes(selectedMarketScope)) {
      setSelectedMarketScope(marketScopes[0]);
    }
  }, [marketScopes, selectedMarketScope]);


  const cashDialogOpen = cashDialogSide != null;
  const baseCurrency = bootstrap?.baseCurrency || "USD";
  const totalEquity = bootstrap?.account.totalEquity ?? 0;
  const holdingsValue = useMemo(
    () => (bootstrap?.assetUniverse || []).filter((row) => row.holdingQty > 0).reduce((sum, row) => sum + (row.valuationBase || 0), 0),
    [bootstrap],
  );
  const cashValue = bootstrap?.account.cash ?? 0;
  const dailyPnl = dailyPnlFromSnapshots(snapshots, totalEquity);
  const holdingCount = useMemo(
    () => (bootstrap?.assetUniverse || []).filter((row) => row.holdingQty > 0).length,
    [bootstrap],
  );

  const trendData = useMemo(() => {
    if (!snapshots.length) return [];
    return [...snapshots]
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .slice(-90)
      .map((row) => ({
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
    const top = rows.slice(0, 5).map((row) => ({ name: row.symbol, value: row.valuationBase || 0 }));
    const topSum = top.reduce((sum, row) => sum + row.value, 0);
    const other = Math.max(0, holdingsValue - topSum);
    return [
      ...top,
      ...(other > 0 ? [{ name: "其他", value: other }] : []),
      ...(cashValue > 0 ? [{ name: "现金", value: cashValue }] : []),
    ];
  }, [bootstrap, holdingsValue, cashValue]);
  const allocationTotal = allocationData.reduce((sum, row) => sum + Math.max(0, Number(row.value || 0)), 0);

  useEffect(() => {
    if (cashDialogOpen) setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
  }, [cashDialogOpen, baseCurrency]);

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
        baseCurrency: cashCurrency,
        note: cashNote.trim() || undefined,
      });
      toast.success(cashDialogSide === "deposit" ? "入金已记录" : "出金已记录");
      setCashDialogSide(null);
      setCashAmount("");
      setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
      setCashNote("");
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "现金流水提交失败");
    } finally {
      setCashSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <DeepLedgerPageHeader
        eyebrow="Portfolio Intelligence"
        title="投资组合总览"
        description="先判断、再追踪、后操作。你可以在这里快速查看组合健康度、权益轨迹、配置分布与最近资金动作。"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerActionButton tone="primary" onClick={() => void handleRefreshMarketContext()} disabled={loading || refreshing || marketContextRefreshing}>
              <RefreshCcw className={`h-4 w-4 ${marketContextRefreshing ? "animate-spin" : ""}`} />
              {marketContextRefreshing ? "刷新市场中..." : "立即刷新市场状态层"}
            </DeepLedgerActionButton>
            <DeepLedgerActionButton onClick={() => void load(true)} disabled={loading || refreshing}>
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "刷新中..." : "刷新数据"}
            </DeepLedgerActionButton>
          </div>
        )}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DeepLedgerMetricCard
          label="总权益"
          value={formatCurrency(totalEquity, baseCurrency)}
          subLabel={`基准币 ${baseCurrency}`}
          accent="cyan"
        />
        <DeepLedgerMetricCard
          label="持仓市值"
          value={formatCurrency(holdingsValue, baseCurrency)}
          subLabel={`当前持仓 ${holdingCount} 个标的`}
          accent="green"
        />
        <DeepLedgerMetricCard
          label="现金余额"
          value={formatCurrency(cashValue, baseCurrency)}
          subLabel={totalEquity > 0 ? `${((cashValue / totalEquity) * 100).toFixed(1)}% 组合仓位` : "暂无可计算仓位"}
          accent="amber"
        />
        <DeepLedgerMetricCard
          label="今日损益"
          value={`${dailyPnl >= 0 ? "+" : ""}${formatCurrency(dailyPnl, baseCurrency)}`}
          subLabel={trendData.at(-1) ? `最新快照 ${trendData.at(-1)?.date}` : "暂无快照数据"}
          accent="indigo"
        />
      </div>

      <DeepLedgerPanel accent="slate" title="运行摘要" subtitle="面向今日操作前的快速判断。">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {([
            { label: "账户状态", value: totalEquity > 0 ? "已建立净值" : "等待入金", tone: totalEquity > 0 ? "green" : "amber" },
            { label: "现金使用", value: totalEquity > 0 ? `${(((totalEquity - cashValue) / totalEquity) * 100).toFixed(1)}%` : "0.0%", tone: "cyan" },
            { label: "快照数量", value: `${snapshots.length} 条`, tone: "indigo" },
            { label: "流水记录", value: `${cashLedger.length} 条`, tone: "slate" },
          ] as Array<{ label: string; value: string; tone: DeepLedgerTone }>).map((item) => (
            <div key={item.label} className="rounded-2xl border border-[var(--border)] bg-[rgba(8,12,20,0.45)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">{item.label}</div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="font-[var(--font-mono)] text-lg text-[var(--text)]">{item.value}</div>
                <DeepLedgerStatusPill tone={item.tone}>{item.label}</DeepLedgerStatusPill>
              </div>
            </div>
          ))}
        </div>
      </DeepLedgerPanel>

      <DeepLedgerPanel
        accent="indigo"
        title="市场温度"
        subtitle="按市场维度分别观察美股、港股/中概、加密与宏观防御环境；买入执行系数只作用于对应市场，不再把不同市场混成一条全局曲线。"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            {marketScopes.map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setSelectedMarketScope(scope)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selectedScope === scope ? "border-[rgba(129,140,248,0.36)] bg-[rgba(129,140,248,0.14)] text-[var(--text)]" : "border-[var(--border)] bg-[rgba(8,12,20,0.46)] text-[var(--muted)] hover:border-[rgba(129,140,248,0.24)] hover:text-[var(--text)]"}`}
              >
                {MARKET_SCOPE_LABEL_ZH_V1[scope]}
              </button>
            ))}
            {([30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setMarketHistoryRange(days)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${marketHistoryRange === days ? "border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.14)] text-[var(--text)]" : "border-[var(--border)] bg-[rgba(8,12,20,0.46)] text-[var(--muted)] hover:border-[rgba(56,189,248,0.24)] hover:text-[var(--text)]"}`}
              >
                {days}D
              </button>
            ))}
          </div>
        )}
      >
        {bootstrap?.marketContext ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {marketScopes.map((scope) => {
                const scopeContext = bootstrap.marketContext?.scopes?.find((item) => item.scope === scope) || null;
                if (!scopeContext) return null;
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setSelectedMarketScope(scope)}
                    className={`rounded-2xl border px-4 py-4 text-left transition-colors ${selectedScope === scope ? "border-[rgba(129,140,248,0.32)] bg-[rgba(20,28,46,0.72)]" : "border-[var(--border)] bg-[rgba(8,12,20,0.52)] hover:border-[rgba(129,140,248,0.2)]"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">{scopeContext.label}</div>
                      <DeepLedgerStatusPill tone={marketRegimeTone(scopeContext.regime)}>{marketRegimeLabel(scopeContext.regime)}</DeepLedgerStatusPill>
                    </div>
                    <div className="mt-3 font-[var(--font-mono)] text-lg text-[var(--text)]">{scopeContext.riskOffScorePct.toFixed(1)}%</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">普通买入 {Math.round(scopeContext.buyScale * 100)}% · 高波动买入 {Math.round(scopeContext.highRiskBuyScale * 100)}%</div>
                  </button>
                );
              })}
            </div>

            {selectedScopeContext ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--border)] bg-[rgba(8,12,20,0.52)] px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">{selectedScopeContext.label}环境</div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="font-[var(--font-mono)] text-lg text-[var(--text)]">{marketRegimeLabel(selectedScopeContext.regime)}</div>
                      <DeepLedgerStatusPill tone={marketRegimeTone(selectedScopeContext.regime)}>{marketRegimeLabel(selectedScopeContext.regime)}</DeepLedgerStatusPill>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[rgba(8,12,20,0.52)] px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">风险分 / 置信度</div>
                    <div className="mt-3 font-[var(--font-mono)] text-lg text-[var(--text)]">{selectedScopeContext.riskOffScorePct.toFixed(1)}%</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">置信度 {selectedScopeContext.confidencePct.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[rgba(8,12,20,0.52)] px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">执行系数</div>
                    <div className="mt-3 font-[var(--font-mono)] text-lg text-[var(--text)]">普通买入 {Math.round(selectedScopeContext.buyScale * 100)}%</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">高波动买入 {Math.round(selectedScopeContext.highRiskBuyScale * 100)}%</div>
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                    {selectedScopeContext.indicators.map((indicator) => (
                      <div key={indicator.key} className="rounded-2xl border border-[rgba(129,140,248,0.18)] bg-[rgba(8,12,20,0.46)] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-[var(--text)]">{indicator.label}</div>
                          <DeepLedgerStatusPill tone={marketRegimeTone(indicator.stance === "neutral" ? "transitional" : indicator.stance)}>{indicator.stance === "neutral" ? "中性" : marketRegimeLabel(indicator.stance)}</DeepLedgerStatusPill>
                        </div>
                        <div className="mt-3 font-[var(--font-mono)] text-base text-[var(--text)]">{formatIndicatorValue(indicator.rawValue, indicator.unit)}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">{marketPercentileTextV1(indicator.percentile252)}</div>
                        <div className="mt-3 text-xs leading-6 text-[var(--muted)]">{indicator.reason}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-[rgba(129,140,248,0.16)] bg-[rgba(8,12,20,0.42)] px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">关键原因</div>
                    <div className="mt-3 grid gap-2">
                      {selectedScopeContext.reasons.slice(0, 4).map((reason) => (
                        <div key={reason} className="rounded-xl border border-[rgba(255,255,255,0.06)] px-3 py-2 text-sm text-[var(--text)]">
                          {reason}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 text-xs leading-6 text-[var(--muted)]">
                      “偏防守”表示该市场当前更谨慎；买入执行系数表示该市场的买入建议会在执行层缩减到多少比例，卖出不受影响。
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[rgba(129,140,248,0.16)] bg-[rgba(8,12,20,0.42)] px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">历史曲线</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">已按 {selectedScopeContext.label} 独立展示最近 {marketHistoryRange} 天的指标轨迹，不再把不同市场混画在一起。</div>
                    </div>
                    {marketHistoryRefreshing ? <DeepLedgerStatusPill tone="slate">刷新中</DeepLedgerStatusPill> : null}
                  </div>
                  {marketHistoryLoading ? (
                    <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--muted)]">正在加载市场历史曲线...</div>
                  ) : marketHistoryError ? (
                    <div className="mt-4 rounded-xl border border-[rgba(248,113,113,0.22)] bg-[rgba(248,113,113,0.08)] px-4 py-4 text-sm text-[var(--danger)]">{marketHistoryError}</div>
                  ) : marketHistoryData.length > 0 ? (
                    <div className="mt-4 space-y-4">
                      <OverviewChartFrame height={280}>
                        {({ width, height }) => (
                          <LineChart width={width} height={height} data={marketHistoryData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 11, fill: "var(--faint)", fontFamily: "var(--font-mono)" }}
                              axisLine={false}
                              tickLine={false}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={{ fontSize: 11, fill: "var(--faint)", fontFamily: "var(--font-mono)" }}
                              axisLine={false}
                              tickLine={false}
                              width={38}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "var(--elevated)",
                                border: "1px solid var(--border-strong)",
                                borderRadius: "14px",
                                color: "var(--text)",
                              }}
                              formatter={(value, name) => {
                                if (typeof value !== "number") return ["N/A", MARKET_INDICATOR_LINE_META_V1[name as DaaMarketIndicatorKeyV1]?.label || String(name)];
                                return [`${value.toFixed(1)}%`, MARKET_INDICATOR_LINE_META_V1[name as DaaMarketIndicatorKeyV1]?.label || String(name)];
                              }}
                              labelFormatter={(value) => `日期 ${String(value || "")}`}
                            />
                            {selectedScopeKeys.map((key) => (
                              <Line
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stroke={MARKET_INDICATOR_LINE_META_V1[key].color}
                                strokeWidth={2}
                                dot={false}
                                connectNulls
                                activeDot={{ r: 4 }}
                              />
                            ))}
                          </LineChart>
                        )}
                      </OverviewChartFrame>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {selectedScopeKeys.map((key) => {
                          const indicator = selectedScopeContext.indicators.find((item) => item.key === key) || null;
                          return (
                            <div key={key} className="rounded-xl border border-[rgba(255,255,255,0.06)] px-3 py-2.5 text-sm text-[var(--text)]">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ background: MARKET_INDICATOR_LINE_META_V1[key].color }} />
                                <span className="font-medium">{MARKET_INDICATOR_LINE_META_V1[key].label}</span>
                              </div>
                              <div className="mt-1 text-xs text-[var(--muted)]">当前 {indicator ? `${indicator.riskOffScorePct.toFixed(1)}%` : "N/A"}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--muted)]">最近 {marketHistoryRange} 天还没有足够的 {selectedScopeContext.label} 历史快照。</div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
            当前还没有可用的市场状态快照，系统会在下一次刷新后按市场补齐美股、港股/中概、加密与宏观防御指标。
          </div>
        )}
      </DeepLedgerPanel>

      {(bootstrap?.overviewAlerts || []).length > 0 && (
        <DeepLedgerPanel accent="amber" title="系统提醒" subtitle="来自组合健康度、现金管理与风控层的即时提示。">
          <div className="grid gap-3 lg:grid-cols-2">
            {(bootstrap?.overviewAlerts || []).map((alert) => (
              <div
                key={alert.id}
                className="rounded-2xl border px-4 py-3"
                style={{
                  borderColor:
                    alert.level === "warn"
                      ? "rgba(246,173,85,0.28)"
                      : alert.level === "success"
                        ? "rgba(52,211,153,0.28)"
                        : "rgba(56,189,248,0.24)",
                  background:
                    alert.level === "warn"
                      ? "rgba(246,173,85,0.08)"
                      : alert.level === "success"
                        ? "rgba(52,211,153,0.08)"
                        : "rgba(56,189,248,0.08)",
                }}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: toneColor(alertTone(alert.level)) }} />
                  <div>
                    <DeepLedgerStatusPill tone={alertTone(alert.level)}>{alert.level}</DeepLedgerStatusPill>
                    <div className="mt-2 text-sm leading-6 text-[var(--text)]">{alert.text}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DeepLedgerPanel>
      )}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.95fr)]">
        <DeepLedgerPanel accent="cyan" title="权益趋势" subtitle="近 90 天总权益、持仓与现金的变化轨迹。">
          {trendData.length > 0 ? (
            <>
              <OverviewChartFrame height={300}>
                {({ width, height }) => (
                  <AreaChart width={width} height={height} data={trendData} margin={{ top: 8, right: 10, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradHoldings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34D399" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--faint)", fontFamily: "var(--font-mono)" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--faint)", fontFamily: "var(--font-mono)" }}
                      axisLine={false}
                      tickLine={false}
                      width={66}
                      tickFormatter={(value) => formatCurrencyCompact(Number(value || 0), baseCurrency)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--elevated)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "14px",
                        fontSize: "12px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text)",
                      }}
                      labelFormatter={(label) => `日期 ${label}`}
                      formatter={(value, key) => {
                        const label = key === "totalEquity" ? "总权益" : key === "holdings" ? "持仓" : "现金";
                        return [formatCurrency(Number(value || 0), baseCurrency), label];
                      }}
                    />
                    <Area type="monotone" dataKey="holdings" stroke="#34D399" strokeWidth={1.4} fill="url(#gradHoldings)" />
                    <Area type="monotone" dataKey="totalEquity" stroke="#38BDF8" strokeWidth={2.2} fill="url(#gradEquity)" />
                  </AreaChart>
                )}
              </OverviewChartFrame>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                <DeepLedgerStatusPill tone="cyan">总权益</DeepLedgerStatusPill>
                <DeepLedgerStatusPill tone="green">持仓</DeepLedgerStatusPill>
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 font-[var(--font-mono)] text-[var(--faint)]">
                  最近 {trendData.length} 个快照点
                </span>
              </div>
            </>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] px-5 py-16 text-center text-sm text-[var(--faint)]">
              暂无权益快照，完成入金或交易后会逐步形成净值曲线。
            </div>
          )}
        </DeepLedgerPanel>

        <DeepLedgerPanel accent="amber" title="资产配置" subtitle="按当前持仓估值拆分，帮助判断集中度与现金占比。">
          {allocationData.length > 0 ? (
            <div className="grid items-center gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <OverviewChartFrame height={220}>
                {({ width, height }) => (
                  <PieChart width={Math.min(width, 240)} height={height}>
                    <Tooltip
                      contentStyle={{
                        background: "var(--elevated)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "14px",
                        fontSize: "12px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text)",
                      }}
                      formatter={(value, _label, item) => [
                        formatCurrency(Number(value || 0), baseCurrency),
                        typeof item?.payload?.name === "string" ? item.payload.name : "占比",
                      ]}
                    />
                    <Pie
                      data={allocationData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={56}
                      outerRadius={86}
                      paddingAngle={2}
                      stroke="rgba(8,12,20,0.85)"
                      strokeWidth={4}
                    >
                      {allocationData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                )}
              </OverviewChartFrame>
              <div className="space-y-3">
                {allocationData.map((entry, index) => {
                  const pct = allocationTotal > 0 ? (entry.value / allocationTotal) * 100 : 0;
                  const color = PIE_COLORS[index % PIE_COLORS.length];
                  return (
                    <div key={entry.name} className="rounded-2xl border border-[var(--border)] bg-[rgba(8,12,20,0.45)] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                          <span className="truncate text-sm font-medium text-[var(--text)]">{entry.name}</span>
                        </div>
                        <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="mt-2 font-[var(--font-mono)] text-sm text-[var(--muted)]">{formatCurrency(entry.value, baseCurrency)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] px-5 py-16 text-center text-sm text-[var(--faint)]">
              暂无配置数据，添加持仓后会显示资产分布。
            </div>
          )}
        </DeepLedgerPanel>
      </div>

      <DeepLedgerPanel
        accent="indigo"
        title="资金流水"
        subtitle="仅记录现金出入，不触发自动交易。"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerActionButton tone="primary" onClick={() => setCashDialogSide("deposit")}>
              <Plus className="h-4 w-4" />
              入金
            </DeepLedgerActionButton>
            <DeepLedgerActionButton onClick={() => setCashDialogSide("withdraw")}>
              <Minus className="h-4 w-4" />
              出金
            </DeepLedgerActionButton>
            <Link
              href="/daa/dashboard/workbench"
              className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--text)]"
            >
              工作台
            </Link>
            <Link
              href="/daa/dashboard/trades"
              className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--text)]"
            >
              交易记录
            </Link>
          </div>
        )}
      >
        <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.45)]">
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: "var(--border)" }}>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--faint)" }}>时间</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--faint)" }}>方向</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--faint)" }}>金额</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--faint)" }}>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashLedger.map((row) => {
                const amountView = buildCashLedgerAmountViewV1(row);
                const meta = buildCashLedgerMetaV1(row);
                return (
                  <TableRow key={row.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderColor: "var(--border)" }}>
                    <TableCell className="text-xs tabular-nums" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      {new Date(row.ts).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <DeepLedgerStatusPill tone={row.side === "deposit" ? "green" : "amber"}>
                        {cashLedgerSideLabelV1(row)}
                      </DeepLedgerStatusPill>
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                      <div>{amountView.primary}</div>
                      {amountView.secondary ? (
                        <div className="mt-1 text-[11px] font-normal" style={{ color: "var(--faint)" }}>
                          {amountView.secondary}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs" style={{ color: "var(--muted)" }}>
                      <div>{row.note || (row.entryKind === "trade_execution" ? "成交自动入账" : "-")}</div>
                      {meta.length ? (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {meta.map((item) => (
                            <span
                              key={`${row.id}-${item}`}
                              className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                              style={{ borderColor: "var(--border-strong)", color: "var(--faint)" }}
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!cashLedger.length && (
                <TableRow style={{ borderColor: "var(--border)" }}>
                  <TableCell colSpan={4} className="py-12 text-center text-sm" style={{ color: "var(--faint)" }}>
                    暂无资金流水记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DeepLedgerPanel>

      {loading && (
        <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] px-6 py-10 text-center text-sm text-[var(--faint)]">
          总览数据加载中...
        </div>
      )}

      {error && (
        <div className="rounded-[18px] border border-[rgba(248,113,113,0.22)] bg-[rgba(248,113,113,0.08)] px-5 py-4 text-sm text-[var(--danger)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">总览数据加载失败</div>
              <div className="mt-1 text-[var(--muted)]">{error}</div>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={cashDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCashDialogSide(null);
            setCashAmount("");
            setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
            setCashNote("");
          }
        }}
      >
        <DialogContent className="max-w-md border-[var(--border)] bg-[var(--surface)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle>{cashDialogSide === "withdraw" ? "记录出金" : "记录入金"}</DialogTitle>
            <DialogDescription>仅记录现金流水并更新现金余额，不会触发自动交易。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>币种</Label>
              <select
                value={cashCurrency}
                onChange={(e) => setCashCurrency(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--elevated)] px-3 text-sm text-[var(--text)] outline-none transition-all focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(56,189,248,0.16)]"
              >
                {CASH_CURRENCY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>金额（{normalizeCashCurrency(cashCurrency)}）</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder={`请输入 ${normalizeCashCurrency(cashCurrency)} 金额`}
                className="border-[var(--border-strong)] bg-[var(--elevated)]"
              />
              <p className="text-xs text-[var(--muted)]">
                系统会按最新 FX 汇率折算到账户基准币 {baseCurrency} 后更新现金余额。
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>备注（可选）</Label>
              <Input
                value={cashNote}
                onChange={(e) => setCashNote(e.target.value)}
                placeholder="例如：工资入账 / 提现"
                className="border-[var(--border-strong)] bg-[var(--elevated)]"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setCashDialogSide(null);
                setCashAmount("");
                setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
                setCashNote("");
              }}
              className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--muted)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--text)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitCashLedger()}
              disabled={cashSubmitting}
              className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {cashSubmitting ? "提交中..." : "确认提交"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
