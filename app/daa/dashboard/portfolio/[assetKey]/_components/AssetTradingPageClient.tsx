"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { AssetKlineChart, type KlineTradeMarker } from "@/app/daa/dashboard/workbench/_components/AssetKlineChart";

import { AssetInfoBar } from "./AssetInfoBar";
import { SignalDashboard } from "./SignalDashboard";
import { InlineTradePanel } from "./InlineTradePanel";
import { WatchlistAutoEntryPanel } from "./WatchlistAutoEntryPanel";

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
      <AssetInfoBar row={row} baseCurrency={baseCurrency} />

      {/* 主体：左 K 线 + 右面板 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* 左侧：K 线图 */}
        <SectionErrorBoundary sectionName="K线图">
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-2">
            <AssetKlineChart
              symbol={row.yfinanceSymbol || row.symbol}
              market={row.market}
              className="min-h-[480px]"
              tradeMarkers={tradeMarkers}
              costBasisPerShare={costBasisPerShare}
            />
          </div>
        </SectionErrorBoundary>

        {/* 右侧：信号仪表盘 + 交易面板 */}
        <div className="space-y-4">
          <SectionErrorBoundary sectionName="信号仪表盘">
            <SignalDashboard assetKey={props.assetKey} />
          </SectionErrorBoundary>

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

          {row.watchEnabled && row.holdingQty === 0 ? (
            <SectionErrorBoundary sectionName="自动建仓规则">
              <WatchlistAutoEntryPanel assetKey={row.assetKey} />
            </SectionErrorBoundary>
          ) : null}
        </div>
      </div>
    </div>
  );
}
