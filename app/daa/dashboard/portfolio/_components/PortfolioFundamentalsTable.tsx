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
  const asOfDate = new Date(iso);
  if (Number.isNaN(asOfDate.getTime())) return "暂无数据";
  return asOfDate.toLocaleDateString(NUMBER_LOCALE, { month: "2-digit", day: "2-digit" });
}

function peTone(pe: number | null): string {
  if (pe == null) return "text-[var(--faint)]";
  if (pe < 0) return "text-[var(--danger)]";
  if (pe > 60) return "text-[var(--amber)]";
  return "text-[var(--text)]";
}

function debtTone(ratio: number | null): string {
  if (ratio == null) return "text-[var(--faint)]";
  if (ratio > 200) return "text-[var(--danger)]";
  if (ratio > 100) return "text-[var(--amber)]";
  return "text-[var(--success)]";
}

function profitTone(value: number | null): string {
  if (value == null) return "text-[var(--faint)]";
  if (value < 0) return "text-[var(--danger)]";
  return "text-[var(--success)]";
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
      const fundamentalsResponse = await fetch("/api/daa/portfolio/fundamentals", { cache: "no-store" });
      const json = (await fundamentalsResponse.json()) as ApiResponse;
      if (!fundamentalsResponse.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${fundamentalsResponse.status}`);
      }
      setData(json.data?.items ?? []);
      setAsOf(json.data?.asOf ?? null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const sortedRows = useMemo(() => {
    const rowsWithData = data.filter((row) => row.hasData);
    const rowsWithoutData = data.filter((row) => !row.hasData);
    return [
      ...rowsWithData.sort((leftRow, rightRow) => (rightRow.marketCap ?? 0) - (leftRow.marketCap ?? 0)),
      ...rowsWithoutData,
    ];
  }, [data]);

  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <TableProperties className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-sm font-semibold text-[var(--text)]">持仓基本面</h2>
          <span className="text-[11px] text-[var(--faint)]">{data.length} 只 · 数据日期 {formatAsOf(asOf)}</span>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载基本面…
        </div>
      ) : null}

      {error ? (
        <div className="m-4 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2 text-sm text-[var(--amber)]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {!loading && !error && sortedRows.length === 0 ? (
        <div className="m-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-3 text-sm text-[var(--muted)]">
          暂无持仓。基本面数据会在下次数据刷新后展示。
        </div>
      ) : null}

      {!loading && sortedRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface)] text-[11px] font-semibold text-[var(--muted)]">
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
            <tbody className="divide-y divide-[var(--border)]">
              {sortedRows.map((row) => (
                <tr key={row.assetKey} className={cn(!row.hasData && "opacity-60")}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[var(--text)]">{row.displayName}</div>
                    <div className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">
                      {row.symbol} · {row.market}
                    </div>
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-[var(--font-mono)]", peTone(row.pe))}>
                    {formatRatio(row.pe)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[var(--font-mono)] text-[var(--text)]">
                    {formatRatio(row.pb)}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-[var(--font-mono)]", debtTone(row.debtToEquityPct))}>
                    {formatPercent(row.debtToEquityPct)}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-[var(--font-mono)]", profitTone(row.freeCashflow))}>
                    {formatBigNumber(row.freeCashflow, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[var(--font-mono)] text-[var(--text)]">
                    {formatBigNumber(row.totalRevenue, row.currency)}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-[var(--font-mono)]", profitTone(row.netIncome))}>
                    {formatBigNumber(row.netIncome, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[var(--font-mono)] text-[var(--text)]">
                    {formatEps(row.trailingEps, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[11px] text-[var(--faint)]">
            数据来源 Yahoo Finance · 现金流采用 freeCashflow 口径；ETF / 商品 / 加密无个股基本面
          </div>
        </div>
      ) : null}
    </section>
  );
}
