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
  if (score >= 68) return "green";
  if (score <= 42) return "red";
  return "amber";
}

function momentumLabel(value: DaaTechnicalSignal["momentumRegime"]): string {
  if (value === "strong") return "强动量";
  if (value === "weak") return "弱动量";
  return "中性动量";
}

function statusTone(status: "bullish" | "bearish" | "neutral" | "unavailable" | undefined): DaaSurfaceTone {
  if (status === "bullish") return "green";
  if (status === "bearish") return "red";
  if (status === "neutral") return "amber";
  return "slate";
}

function MetricGroup({ title, rows }: { title: string; rows: MetricRow[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-semibold text-[#59636f]">{title}</div>
      <div className="divide-y divide-[#151b22] border-y border-[#151b22]">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] gap-3 py-2.5 text-sm">
            <div className="min-w-0 text-[#8a939f]">{row.label}</div>
            <div className={cn("min-w-0 text-right font-[var(--font-mono)] text-[#d6dde5]", row.tone === "green" && "text-[#00c076]", row.tone === "red" && "text-[#f84960]", row.tone === "amber" && "text-[#f7b500]")}>
              {row.value}
              {row.hint ? <span className="ml-1 font-sans text-[11px] text-[#59636f]">{row.hint}</span> : null}
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
  const [data, setData] = useState<TechnicalSignalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!symbol) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daa/signals/technical?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data as TechnicalSignalResponse);
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
    const signal = data?.signal;
    if (!signal) return [];
    const m = signal.metrics;
    return [
      {
        title: "趋势",
        rows: [
          { label: "收盘价", value: formatPrice(m.close, currency) },
          { label: "SMA20", value: formatPrice(m.sma20, currency), tone: m.close >= m.sma20 ? "green" as const : "red" as const },
          { label: "SMA60", value: formatPrice(m.sma60, currency), tone: m.sma20 >= m.sma60 ? "green" as const : "red" as const },
          { label: "EMA12 / EMA26", value: `${formatNumber(m.ema12, 4)} / ${formatNumber(m.ema26, 4)}` },
        ],
      },
      {
        title: "动量",
        rows: [
          { label: "RSI14", value: formatNumber(m.rsi14, 2), tone: m.rsi14 >= 45 && m.rsi14 <= 70 ? "green" as const : m.rsi14 > 78 || m.rsi14 < 35 ? "red" as const : "amber" as const },
          { label: "MACD", value: formatNumber(m.macd, 4), tone: m.macd >= m.macdSignal ? "green" as const : "red" as const },
          { label: "MACD Signal", value: formatNumber(m.macdSignal, 4) },
          { label: "MACD Hist", value: formatNumber(m.macdHist, 4), tone: m.macdHist >= 0 ? "green" as const : "red" as const },
        ],
      },
      {
        title: "波动 / 区间",
        rows: [
          { label: "BOLL 上 / 中 / 下", value: `${formatNumber(m.bollingerUpper, 2)} / ${formatNumber(m.bollingerMid, 2)} / ${formatNumber(m.bollingerLower, 2)}` },
          { label: "20日 / 60日收益", value: `${formatNumber(m.return20Pct, 2, "%")} / ${formatNumber(m.return60Pct, 2, "%")}`, tone: m.return20Pct >= 0 ? "green" as const : "red" as const },
          { label: "30日回撤", value: formatNumber(m.drawdown30Pct, 2, "%"), tone: m.drawdown30Pct < -12 ? "red" as const : "slate" as const },
          { label: "年化波动", value: formatNumber(m.annualizedVolPct, 2, "%"), tone: m.annualizedVolPct > 45 ? "amber" as const : "slate" as const },
        ],
      },
    ];
  }, [currency, data?.signal]);

  const signal = data?.signal ?? null;

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#a3ff12]" />
          <h3 className="text-sm font-semibold text-[#f3f6f8]">技术指标</h3>
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
          className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] text-[#59636f] transition-colors hover:bg-[#151b22] hover:text-[#d6dde5] disabled:opacity-50"
          aria-label="刷新技术指标"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[#8a939f]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载技术指标…
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-[12px] border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-sm text-amber-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {!loading && !error && !signal ? (
        <div className="rounded-[10px] border border-dashed border-[#252d36] bg-[#050607] px-4 py-8 text-center text-sm text-[#8a939f]">
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
              <div className="mb-2 text-[11px] font-semibold text-[#59636f]">信号理由</div>
              <div className="flex flex-wrap gap-2">
                {signal.reasons.map((reason) => (
                  <span key={reason} className="rounded-[6px] border border-[#1a222a] bg-[#050607] px-3 py-1 text-xs text-[#8a939f]">
                    {reason}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold text-[#59636f]">资产特化指标</div>
              <div className="divide-y divide-[#151b22] border-y border-[#151b22]">
                {signal.specific.map((item) => (
                  <div key={item.key} className="grid grid-cols-[minmax(0,0.9fr)_auto] gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-[#d6dde5]">{item.label}</div>
                      {item.description ? <div className="mt-0.5 line-clamp-1 text-xs text-[#59636f]">{item.description}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-[var(--font-mono)] text-[#d6dde5]">
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
