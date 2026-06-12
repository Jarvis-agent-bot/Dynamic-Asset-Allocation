"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, Loader2, RefreshCw } from "lucide-react";

import {
  DaaSurfaceStatusPill,
  type DaaSurfaceTone,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";
import type { DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";

type TechnicalSignalResponse = {
  symbol: string;
  signal: DaaTechnicalSignal | null;
  unavailableReason: string | null;
};

type MetricRow = {
  label: string;
  value: string;
  tone?: DaaSurfaceTone;
  hint?: string;
};

function formatPrice(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "-";
  return `${currency} ${value.toFixed(Math.abs(value) >= 100 ? 2 : 4)}`;
}

function formatNumber(value: number, digits = 2, suffix = ""): string {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}${suffix}`;
}

function scoreTone(score: number): DaaSurfaceTone {
  if (score >= 68) return "success";
  if (score <= 42) return "danger";
  return "warning";
}

function momentumLabel(value: DaaTechnicalSignal["momentumRegime"]): string {
  if (value === "strong") return "强动量";
  if (value === "weak") return "弱动量";
  return "中性动量";
}

function statusTone(status: "bullish" | "bearish" | "neutral" | "unavailable" | undefined): DaaSurfaceTone {
  if (status === "bullish") return "success";
  if (status === "bearish") return "danger";
  if (status === "neutral") return "warning";
  return "neutral";
}

function MetricGroup({ title, rows }: { title: string; rows: MetricRow[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-semibold text-[var(--faint)]">{title}</div>
      <div className="divide-y divide-[var(--elevated)] border-y border-[var(--elevated)]">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] gap-3 py-2.5 text-sm">
            <div className="min-w-0 text-[var(--muted)]">{row.label}</div>
            <div className={cn("min-w-0 text-right font-[var(--font-mono)] text-[var(--text)]", row.tone === "success" && "text-[var(--success)]", row.tone === "danger" && "text-[var(--danger)]", row.tone === "warning" && "text-[var(--amber)]")}>
              {row.value}
              {row.hint ? <span className="ml-1 font-sans text-[11px] text-[var(--faint)]">{row.hint}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssetTechnicalPanel({
  symbol,
  currency,
}: {
  symbol: string;
  currency: string;
}) {
  const [technicalSignalResponse, setTechnicalSignalResponse] = useState<TechnicalSignalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!symbol) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/daa/signals/technical?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const jsonPayload = await response.json();
      setTechnicalSignalResponse(jsonPayload.data as TechnicalSignalResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载技术指标失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const groups = useMemo(() => {
    const signal = technicalSignalResponse?.signal;
    if (!signal) return [];
    const metrics = signal.metrics;
    return [
      {
        title: "趋势",
        rows: [
          { label: "收盘价", value: formatPrice(metrics.close, currency) },
          { label: "SMA20", value: formatPrice(metrics.sma20, currency), tone: metrics.close >= metrics.sma20 ? "success" as const : "danger" as const },
          { label: "SMA60", value: formatPrice(metrics.sma60, currency), tone: metrics.sma20 >= metrics.sma60 ? "success" as const : "danger" as const },
          { label: "EMA12 / EMA26", value: `${formatNumber(metrics.ema12, 4)} / ${formatNumber(metrics.ema26, 4)}` },
        ],
      },
      {
        title: "动量",
        rows: [
          { label: "RSI14", value: formatNumber(metrics.rsi14, 2), tone: metrics.rsi14 >= 45 && metrics.rsi14 <= 70 ? "success" as const : metrics.rsi14 > 78 || metrics.rsi14 < 35 ? "danger" as const : "warning" as const },
          { label: "MACD", value: formatNumber(metrics.macd, 4), tone: metrics.macd >= metrics.macdSignal ? "success" as const : "danger" as const },
          { label: "MACD Signal", value: formatNumber(metrics.macdSignal, 4) },
          { label: "MACD Hist", value: formatNumber(metrics.macdHist, 4), tone: metrics.macdHist >= 0 ? "success" as const : "danger" as const },
        ],
      },
      {
        title: "波动 / 区间",
        rows: [
          { label: "BOLL 上 / 中 / 下", value: `${formatNumber(metrics.bollingerUpper, 2)} / ${formatNumber(metrics.bollingerMid, 2)} / ${formatNumber(metrics.bollingerLower, 2)}` },
          { label: "20日 / 60日收益", value: `${formatNumber(metrics.return20Pct, 2, "%")} / ${formatNumber(metrics.return60Pct, 2, "%")}`, tone: metrics.return20Pct >= 0 ? "success" as const : "danger" as const },
          { label: "30日回撤", value: formatNumber(metrics.drawdown30Pct, 2, "%"), tone: metrics.drawdown30Pct < -12 ? "danger" as const : "neutral" as const },
          { label: "年化波动", value: formatNumber(metrics.annualizedVolPct, 2, "%"), tone: metrics.annualizedVolPct > 45 ? "warning" as const : "neutral" as const },
        ],
      },
    ];
  }, [currency, technicalSignalResponse?.signal]);

  const signal = technicalSignalResponse?.signal ?? null;

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text)]">技术指标</h3>
          {signal ? (
            <>
              <DaaSurfaceStatusPill tone={scoreTone(signal.scorePct)}>评分 {signal.scorePct.toFixed(0)}</DaaSurfaceStatusPill>
              <DaaSurfaceStatusPill tone={scoreTone(signal.scorePct)}>{momentumLabel(signal.momentumRegime)}</DaaSurfaceStatusPill>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-[var(--muted)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--text)] disabled:opacity-50"
          aria-label="刷新技术指标"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载技术指标…
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2 text-sm text-[var(--amber)]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {!loading && !error && !signal ? (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          历史行情不足，暂时无法生成技术指标。
        </div>
      ) : null}

      {signal ? (
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-3">
            {groups.map((group) => (
              <MetricGroup key={group.title} title={group.title} rows={group.rows} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <div className="mb-2 text-[11px] font-semibold text-[var(--faint)]">信号理由</div>
              <div className="flex flex-wrap gap-2">
                {signal.reasons.map((reason) => (
                  <span key={reason} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">
                    {reason}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold text-[var(--faint)]">资产特化指标</div>
              <div className="divide-y divide-[var(--elevated)] border-y border-[var(--elevated)]">
                {signal.specific.map((item) => (
                  <div key={item.key} className="grid grid-cols-[minmax(0,0.9fr)_auto] gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-[var(--text)]">{item.label}</div>
                      {item.description ? <div className="mt-0.5 line-clamp-1 text-xs text-[var(--faint)]">{item.description}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-[var(--font-mono)] text-[var(--text)]">
                        {typeof item.value === "number" ? formatNumber(item.value, 2) : item.value}
                        {item.unit ? ` ${item.unit}` : ""}
                      </span>
                      <DaaSurfaceStatusPill tone={statusTone(item.status)}>
                        {item.status === "bullish" ? "偏多" : item.status === "bearish" ? "偏空" : item.status === "neutral" ? "中性" : "无数据"}
                      </DaaSurfaceStatusPill>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
