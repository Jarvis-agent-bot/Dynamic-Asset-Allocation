"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, TableProperties } from "lucide-react";

import { cn } from "@/lib/utils";

type FundamentalRow = {
  assetKey: string;
  symbol: string;
  market: string;
  displayName: string;
  currency: string;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  debtToEquityPct: number | null;
  freeCashflow: number | null;
  totalRevenue: number | null;
  netIncome: number | null;
  trailingEps: number | null;
  asOf: string | null;
  hasData: boolean;
};

type ApiResponse = {
  ok: boolean;
  data?: { items: FundamentalRow[]; asOf: string | null };
  error?: string;
};

const NUMBER_LOCALE = "zh-CN";

function formatBigNumber(value: number | null, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} 万亿 ${currency}`;
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)} 亿 ${currency}`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)} 万 ${currency}`;
  return `${sign}${abs.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 0 })} ${currency}`;
}

function formatRatio(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function formatPercent(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function formatEps(value: number | null, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} ${currency}`;
}

function formatAsOf(iso: string | null): string {
  if (!iso) return "暂无数据";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "暂无数据";
  return d.toLocaleDateString(NUMBER_LOCALE, { month: "2-digit", day: "2-digit" });
}

function peTone(pe: number | null): string {
  if (pe == null) return "text-slate-400";
  if (pe < 0) return "text-red-600";
  if (pe > 60) return "text-amber-600";
  return "text-slate-800";
}

function debtTone(ratio: number | null): string {
  if (ratio == null) return "text-slate-400";
  if (ratio > 200) return "text-red-600";
  if (ratio > 100) return "text-amber-600";
  return "text-emerald-600";
}

function profitTone(value: number | null): string {
  if (value == null) return "text-slate-400";
  if (value < 0) return "text-red-600";
  return "text-emerald-600";
}

export function PortfolioFundamentalsTable() {
  const [data, setData] = useState<FundamentalRow[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/daa/portfolio/fundamentals", { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(json.data?.items ?? []);
      setAsOf(json.data?.asOf ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const sortedRows = useMemo(() => {
    const withData = data.filter((r) => r.hasData);
    const withoutData = data.filter((r) => !r.hasData);
    return [
      ...withData.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)),
      ...withoutData,
    ];
  }, [data]);

  return (
    <section className="overflow-hidden rounded-[16px] border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <TableProperties className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-sm font-semibold text-slate-900">持仓基本面</h2>
          <span className="text-[11px] text-slate-400">{data.length} 只 · 数据日期 {formatAsOf(asOf)}</span>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载基本面…
        </div>
      ) : null}

      {error ? (
        <div className="m-4 flex items-center gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {!loading && !error && sortedRows.length === 0 ? (
        <div className="m-4 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          暂无持仓，基本面数据待 cron_fundamentals_refresh 写入后展示
        </div>
      ) : null}

      {!loading && sortedRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-2.5">标的</th>
                <th className="px-3 py-2.5 text-right">PE (TTM)</th>
                <th className="px-3 py-2.5 text-right">PB</th>
                <th className="px-3 py-2.5 text-right">负债率 D/E</th>
                <th className="px-3 py-2.5 text-right">杠杆自由现金流 (TTM)</th>
                <th className="px-3 py-2.5 text-right">营收 (TTM)</th>
                <th className="px-3 py-2.5 text-right">净利润 (TTM)</th>
                <th className="px-3 py-2.5 text-right">EPS (TTM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map((row) => (
                <tr key={row.assetKey} className={cn(!row.hasData && "opacity-60")}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{row.displayName}</div>
                    <div className="font-[var(--font-mono)] text-[11px] text-slate-400">
                      {row.symbol} · {row.market}
                    </div>
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-[var(--font-mono)]", peTone(row.pe))}>
                    {formatRatio(row.pe)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[var(--font-mono)] text-slate-800">
                    {formatRatio(row.pb)}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-[var(--font-mono)]", debtTone(row.debtToEquityPct))}>
                    {formatPercent(row.debtToEquityPct)}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-[var(--font-mono)]", profitTone(row.freeCashflow))}>
                    {formatBigNumber(row.freeCashflow, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[var(--font-mono)] text-slate-800">
                    {formatBigNumber(row.totalRevenue, row.currency)}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-[var(--font-mono)]", profitTone(row.netIncome))}>
                    {formatBigNumber(row.netIncome, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[var(--font-mono)] text-slate-800">
                    {formatEps(row.trailingEps, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
            数据来源 Yahoo Finance（quoteSummary）· 此处现金流字段为 Yahoo `financialData.freeCashflow` 口径，更接近杠杆自由现金流；ETF / 商品 / 加密无个股基本面
          </div>
        </div>
      ) : null}
    </section>
  );
}
