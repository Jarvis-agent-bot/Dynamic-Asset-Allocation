"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { AssetKlineChart, type KlineTradeMarker } from "@/app/daa/dashboard/_shared/AssetKlineChart";
import { useSparklines } from "@/app/daa/dashboard/_hooks/useSparklines";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

import { AssetInfoBar } from "./AssetInfoBar";
import { AssetDetailTabs } from "./AssetDetailTabs";
import { InlineTradePanel } from "./InlineTradePanel";
import { AssetPositionPanel } from "./AssetPositionPanel";

/** 从交易记录 API 加载该标的的历史交易，用于 K 线标记 */
function useTradeMarkers(symbol: string): KlineTradeMarker[] {
  const [markers, setMarkers] = useState<KlineTradeMarker[]>([]);

  useEffect(() => {
    if (!symbol) return;
    fetch("/api/daa/read/trades")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const orders: Array<{
          symbol: string;
          side: "BUY" | "SELL";
          qty: number;
          price: number;
          executedAt: string;
        }> = j?.data?.records?.orders ?? [];

        const filtered = orders
          .filter((o) => o.symbol === symbol && o.executedAt)
          .map((o) => ({
            date: o.executedAt.slice(0, 10),
            side: o.side,
            qty: o.qty,
            price: o.price,
          }));
        setMarkers(filtered);
      })
      .catch(() => {});
  }, [symbol]);

  return markers;
}

function priceStatusTone(status: string) {
  if (status === "fresh") return "green" as const;
  if (status === "stale") return "amber" as const;
  if (status === "missing" || status === "unsupported") return "red" as const;
  return "slate" as const;
}

function priceStatusLabel(status: string) {
  if (status === "fresh") return "实时";
  if (status === "stale") return "延迟";
  if (status === "missing") return "缺失";
  if (status === "unsupported") return "不支持";
  return "未知";
}

function AssetTradeContextPanel(props: {
  row: AssetUniverseView;
  baseCurrency: string;
}) {
  const { row, baseCurrency } = props;
  const targetPct = row.targetWeightPct ?? row.targetWeightHint ?? 0;
  const gapPct = row.gapPct ?? 0;
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.76)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">交易上下文</h3>
        <DaaSurfaceStatusPill tone={priceStatusTone(row.priceStatus)}>
          {priceStatusLabel(row.priceStatus)}
        </DaaSurfaceStatusPill>
      </div>
      <div className="divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] gap-3 py-2.5">
          <span className="text-[var(--muted)]">价格时间</span>
          <span className="text-right font-[var(--font-mono)] text-[var(--text)]">{formatDateTime(row.priceUpdatedAt)}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] gap-3 py-2.5">
          <span className="text-[var(--muted)]">市值</span>
          <span className="text-right font-[var(--font-mono)] text-[var(--text)]">{formatCurrency(row.valuationBase ?? 0, baseCurrency)}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] gap-3 py-2.5">
          <span className="text-[var(--muted)]">当前 / 目标</span>
          <span className="text-right font-[var(--font-mono)] text-[var(--text)]">{row.actualWeightPct.toFixed(2)}% / {targetPct.toFixed(2)}%</span>
        </div>
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] gap-3 py-2.5">
          <span className="text-[var(--muted)]">偏离</span>
          <span className={`text-right font-[var(--font-mono)] ${Math.abs(gapPct) >= 5 ? "text-red-300" : Math.abs(gapPct) >= 2 ? "text-amber-300" : "text-[var(--text)]"}`}>
            {gapPct.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AssetTradingPageClient(props: { assetKey: string }) {
  const router = useRouter();
  const wbModel = useDashboardPageModel();

  const row = useMemo(() => {
    return wbModel.tableProps.rows.find((r) => r.assetKey === props.assetKey) ?? null;
  }, [wbModel.tableProps.rows, props.assetKey]);

  const baseCurrency = wbModel.bootstrap?.baseCurrency || "USD";
  const slippageBps = wbModel.bootstrap?.execution?.slippageBps ?? 0;

  // 交易标记
  const tradeMarkers = useTradeMarkers(row?.symbol ?? "");
  const sparklineSymbols = useMemo(() => row ? [row.yfinanceSymbol || row.symbol] : [], [row]);
  const sparklines = useSparklines(sparklineSymbols);
  const sparkData = row ? (sparklines[row.yfinanceSymbol || row.symbol] ?? sparklines[row.symbol] ?? null) : null;

  // 成本价（单价）
  const costBasisPerShare = useMemo(() => {
    if (!row || row.holdingQty <= 0 || !row.costBasis || row.costBasis <= 0) return null;
    return row.costBasis / row.holdingQty;
  }, [row]);

  // 加载中
  if (wbModel.loading && !wbModel.bootstrap) {
    return (
      <div className="flex items-center justify-center gap-2 py-20">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
        <span className="text-sm text-[var(--muted)]">加载组合数据…</span>
      </div>
    );
  }

  // 未找到资产
  if (!row) {
    return (
      <div className="space-y-4 py-12 text-center">
        <div className="text-sm text-[var(--muted)]">
          未找到资产 <span className="font-[var(--font-mono)]">{props.assetKey}</span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/daa/dashboard/portfolio")}
          className="rounded-[10px] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
        >
          返回持仓列表
        </button>
      </div>
    );
  }

  const tradeCallbacks = {
    onPreview: wbModel.dialogProps.onPreview,
    onSubmit: wbModel.dialogProps.onSubmitOrder,
  };

  return (
    <div className="space-y-4">
      {/* 顶部信息栏 */}
      <AssetInfoBar row={row} baseCurrency={baseCurrency} sparkData={sparkData} />

      {/* 主体：左 K 线 + 右交易区 */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
        {/* 左侧：K 线图 */}
        <SectionErrorBoundary sectionName="K线图">
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-2">
            <AssetKlineChart
              symbol={row.yfinanceSymbol || row.symbol}
              market={row.market}
              className="min-h-[560px]"
              tradeMarkers={tradeMarkers}
              costBasisPerShare={costBasisPerShare}
            />
          </div>
        </SectionErrorBoundary>

        {/* 右侧：交易面板 + 持仓上下文 */}
        <div className="space-y-4">
          <SectionErrorBoundary sectionName="交易面板">
            <InlineTradePanel
              row={row}
              availableCash={wbModel.availableCashValue}
              slippageBps={slippageBps}
              submitting={wbModel.dialogProps.orderSubmitting}
              callbacks={tradeCallbacks}
              onOrderCompleted={() => void wbModel.loadBootstrap(true)}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="交易上下文">
            <AssetTradeContextPanel row={row} baseCurrency={baseCurrency} />
          </SectionErrorBoundary>

          {row.holdingQty > 0 || row.targetWeightHint > 0 ? (
            <SectionErrorBoundary sectionName="持仓状态">
              <AssetPositionPanel row={row} />
            </SectionErrorBoundary>
          ) : null}
        </div>
      </div>

      {/* 底部：交易所式证据区 */}
      <SectionErrorBoundary sectionName="资产详情">
        <AssetDetailTabs row={row} />
      </SectionErrorBoundary>
    </div>
  );
}
