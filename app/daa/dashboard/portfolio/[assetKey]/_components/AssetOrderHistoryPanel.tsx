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
  if (status === "executed") return "green";
  if (status === "rejected" || status === "canceled") return "red";
  if (status === "submitted" || status === "partially_filled") return "amber";
  return "slate";
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
      const res = await fetch(`/api/daa/read/trades?symbol=${encodeURIComponent(symbol)}&tradeLimit=80`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = json.data as TradesResponse;
      const normalized = symbol.trim().toUpperCase();
      setOrders((data.records?.orders ?? [])
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
          <ReceiptText className="h-4 w-4 text-[#a3ff12]" />
          <h3 className="text-sm font-semibold text-[#f3f6f8]">交易活动</h3>
          <span className="text-[10px] text-[#59636f]">{orders.length} 条</span>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] text-[#59636f] transition-colors hover:bg-[#151b22] hover:text-[#d6dde5] disabled:opacity-50"
          aria-label="刷新订单记录"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[#8a939f]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载订单记录…
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-[12px] border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-sm text-amber-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {!loading && !error && orders.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[#252d36] bg-[#050607] px-4 py-8 text-center text-sm text-[#8a939f]">
          该标的暂无订单记录。
        </div>
      ) : null}

      {!loading && !error && orders.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#151b22] text-[11px] text-[#59636f]">
                <th className="py-2 pr-4 font-semibold">时间</th>
                <th className="py-2 pr-4 font-semibold">方向</th>
                <th className="py-2 pr-4 text-right font-semibold">数量</th>
                <th className="py-2 pr-4 text-right font-semibold">价格</th>
                <th className="py-2 pr-4 text-right font-semibold">金额</th>
                <th className="py-2 text-right font-semibold">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#151b22]">
              {orders.map((order) => (
                <tr key={order.ticketId}>
                  <td className="py-2.5 pr-4 text-xs text-[#8a939f]">{formatDateTime(order.executedAt || order.updatedAt)}</td>
                  <td className="py-2.5 pr-4">
                    <DaaSurfaceStatusPill tone={order.side === "BUY" ? "green" : "amber"}>
                      {order.side === "BUY" ? "买入" : "卖出"}
                    </DaaSurfaceStatusPill>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-[var(--font-mono)] text-[#d6dde5]">{order.qty.toFixed(4)}</td>
                  <td className="py-2.5 pr-4 text-right font-[var(--font-mono)] text-[#d6dde5]">{formatCurrency(order.price, order.instrumentCurrency)}</td>
                  <td className="py-2.5 pr-4 text-right font-[var(--font-mono)] text-[#d6dde5]">{formatCurrency(order.grossNotional, order.instrumentCurrency)}</td>
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
