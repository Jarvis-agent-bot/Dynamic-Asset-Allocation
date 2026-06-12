"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, ReceiptText, RefreshCw } from "lucide-react";

import { DaaSurfaceStatusPill, type DaaSurfaceTone } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import type { TradeTicket } from "@/src/daa/modules/trade/tradeTypes";

type TradesResponse = {
  records?: {
    orders?: TradeTicket[];
  };
};

function statusTone(status: TradeTicket["status"]): DaaSurfaceTone {
  if (status === "executed") return "success";
  if (status === "rejected" || status === "canceled") return "danger";
  if (status === "submitted" || status === "partially_filled") return "warning";
  return "neutral";
}

function statusLabel(status: TradeTicket["status"]): string {
  if (status === "ready") return "待提交";
  if (status === "submitted") return "已提交";
  if (status === "partially_filled") return "部分成交";
  if (status === "executed") return "已成交";
  if (status === "canceled") return "已取消";
  if (status === "rejected") return "已拒绝";
  return status;
}

export function AssetOrderHistoryPanel({ symbol }: { symbol: string }) {
  const [orders, setOrders] = useState<TradeTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!symbol) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/daa/read/trades?symbol=${encodeURIComponent(symbol)}&tradeLimit=80`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const jsonPayload = await response.json();
      const tradesResponse = jsonPayload.data as TradesResponse;
      const normalized = symbol.trim().toUpperCase();
      setOrders((tradesResponse.records?.orders ?? [])
        .filter((order) => order.symbol.trim().toUpperCase() === normalized)
        .slice(0, 12));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载订单记录失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text)]">交易活动</h3>
          <span className="text-[10px] text-[var(--faint)]">{orders.length} 条</span>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-[var(--muted)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--text)] disabled:opacity-50"
          aria-label="刷新订单记录"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载订单记录…
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2 text-sm text-[var(--amber)]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {!loading && !error && orders.length === 0 ? (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          该标的暂无订单记录。
        </div>
      ) : null}

      {!loading && !error && orders.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] text-[var(--faint)]">
                <th className="py-2 pr-4 font-semibold">时间</th>
                <th className="py-2 pr-4 font-semibold">方向</th>
                <th className="py-2 pr-4 text-right font-semibold">数量</th>
                <th className="py-2 pr-4 text-right font-semibold">价格</th>
                <th className="py-2 pr-4 text-right font-semibold">金额</th>
                <th className="py-2 text-right font-semibold">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--elevated)]">
              {orders.map((order) => (
                <tr key={order.ticketId}>
                  <td className="py-2.5 pr-4 text-xs text-[var(--muted)]">{formatDateTime(order.executedAt || order.updatedAt)}</td>
                  <td className="py-2.5 pr-4">
                    <DaaSurfaceStatusPill tone={order.side === "BUY" ? "success" : "warning"}>
                      {order.side === "BUY" ? "买入" : "卖出"}
                    </DaaSurfaceStatusPill>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-[var(--font-mono)] text-[var(--text)]">{order.qty.toFixed(4)}</td>
                  <td className="py-2.5 pr-4 text-right font-[var(--font-mono)] text-[var(--text)]">{formatCurrency(order.price, order.instrumentCurrency)}</td>
                  <td className="py-2.5 pr-4 text-right font-[var(--font-mono)] text-[var(--text)]">{formatCurrency(order.grossNotional, order.instrumentCurrency)}</td>
                  <td className="py-2.5 text-right">
                    <DaaSurfaceStatusPill tone={statusTone(order.status)}>
                      {statusLabel(order.status)}
                    </DaaSurfaceStatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
