"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceNoticeBox,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { useTradeForm, type TradeFormCallbacks } from "@/app/daa/dashboard/_hooks/useTradeForm";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

const SHORTCUTS = [
  { label: "25%", pct: 0.25 },
  { label: "50%", pct: 0.5 },
  { label: "75%", pct: 0.75 },
  { label: "100%", pct: 1.0 },
];

export function InlineTradePanel(props: {
  row: AssetUniverseView;
  availableCash: number;
  slippageBps: number;
  submitting: boolean;
  callbacks: TradeFormCallbacks;
  onOrderCompleted?: () => void;
}) {
  const { row, availableCash, slippageBps } = props;
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");

  const form = useTradeForm({
    assetKey: row.assetKey,
    side,
    callbacks: props.callbacks,
    submitting: props.submitting,
  });
  const previewSlippageCost = form.preview ? form.preview.grossNotional * (slippageBps / 10000) : 0;
  const previewTotalCost = form.preview ? form.preview.grossNotional + form.preview.fee + previewSlippageCost : 0;
  const projectedHoldingQty = form.preview
    ? side === "BUY"
      ? row.holdingQty + form.preview.qty
      : Math.max(0, row.holdingQty - form.preview.qty)
    : row.holdingQty;
  const actionLabel = side === "BUY" ? "买入" : "卖出";

  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <div>
          <div className="text-sm font-semibold text-slate-900">交易</div>
          <div className="mt-0.5 font-[var(--font-mono)] text-[11px] text-slate-400">{row.symbol} · {row.market}</div>
        </div>
        <DaaSurfaceStatusPill tone={form.inputModeTone} className="rounded-[6px] px-2 py-0.5 text-[10px] normal-case tracking-normal">
          {form.inputModeLabel}
        </DaaSurfaceStatusPill>
      </div>

      <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 rounded-[8px] bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={cn(
            "h-8 rounded-[6px] text-sm font-semibold transition-colors",
            side === "BUY"
              ? "bg-emerald-50 text-emerald-600 shadow-sm"
              : "text-slate-500 hover:text-slate-900",
          )}
        >
          买入
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={cn(
            "h-8 rounded-[6px] text-sm font-semibold transition-colors",
            side === "SELL"
              ? "bg-red-50 text-red-600 shadow-sm"
              : "text-slate-500 hover:text-slate-900",
          )}
        >
          卖出
        </button>
      </div>

      <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>成交价</span>
          <span className="font-[var(--font-mono)] text-sm text-slate-800">{row.lastPrice.toFixed(4)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>本地模拟执行 · {row.currency}</span>
          <span className="font-[var(--font-mono)]">{slippageBps.toFixed(0)} bps</span>
        </div>
      </div>

      {/* 数量输入 */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-500">
          数量
        </label>
        <div className="flex h-10 items-center rounded-[8px] border border-slate-300 bg-white px-3 focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]/30">
          <input
            type="number"
            min="0"
            step="0.000001"
            value={form.qty}
            onChange={(e) => form.handleQtyChange(e.target.value)}
            placeholder="输入数量"
            className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <span className="ml-2 shrink-0 font-[var(--font-mono)] text-[11px] text-slate-500">{row.symbol}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {SHORTCUTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => form.handleShortcut({
              holdingQty: row.holdingQty,
              availableCash,
              lastPrice: row.lastPrice,
              pct: s.pct,
            })}
            className="h-7 rounded-[6px] border border-slate-200 bg-white text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 金额输入 */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-500">
          金额 ({row.currency})
        </label>
        <div className="flex h-10 items-center rounded-[8px] border border-slate-300 bg-white px-3 focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]/30">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.notional}
            onChange={(e) => form.handleNotionalChange(e.target.value)}
            placeholder="输入金额"
            className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <span className="ml-2 shrink-0 font-[var(--font-mono)] text-[11px] text-slate-500">{row.currency}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        {side === "BUY" ? (
          <span>可用 {formatCurrency(availableCash, "USD")}</span>
        ) : (
          <span>可卖 {row.holdingQty % 1 === 0 ? row.holdingQty.toLocaleString() : row.holdingQty.toFixed(4)}</span>
        )}
        <span className="font-[var(--font-mono)]">持仓 {row.holdingQty.toLocaleString()}</span>
      </div>

      {!form.preview ? (
        <DaaSurfaceActionButton
          tone={side === "BUY" ? "success" : "danger"}
          className={cn(
            "h-11 w-full justify-center rounded-[8px] border-transparent text-sm font-semibold text-white shadow-sm",
            side === "BUY"
              ? "bg-emerald-500 hover:bg-emerald-600"
              : "bg-red-500 hover:bg-red-600",
          )}
          onClick={() => void form.handlePreview()}
          disabled={!form.canPreview}
        >
          {form.previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {form.previewLoading ? "预览中…" : "生成预览"}
        </DaaSurfaceActionButton>
      ) : null}

      {form.error ? (
        <DaaSurfaceNoticeBox tone="red" title="预览失败" description={form.error} className="rounded-[8px]" />
      ) : null}

      {form.preview ? (
        <div className="space-y-3 rounded-[10px] border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-semibold text-slate-800">订单预览</span>
            <span className={cn("font-[var(--font-mono)] text-xs", side === "BUY" ? "text-emerald-600" : "text-red-600")}>
              {actionLabel} {row.symbol}
            </span>
          </div>
          <div className="divide-y divide-slate-200 text-xs">
            {[
              ["成交数量", form.preview.qty.toFixed(6)],
              ["名义金额", `${form.preview.currency} ${form.preview.grossNotional.toFixed(2)}`],
              ["手续费 / 滑点", `${form.preview.currency} ${(form.preview.fee + previewSlippageCost).toFixed(4)}`],
              [side === "BUY" ? "预估占用" : "成交后持仓", side === "BUY" ? formatCurrency(previewTotalCost, form.preview.currency) : projectedHoldingQty.toFixed(6)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-2">
                <span className="text-slate-500">{label}</span>
                <span className="font-[var(--font-mono)] text-slate-800">{value}</span>
              </div>
            ))}
          </div>

          {form.blockedRiskMessage || form.displayWarnings.length ? (
            <DaaSurfaceNoticeBox
              tone={form.blockedRiskMessage ? "red" : "amber"}
              title={form.blockedRiskMessage ? "风控阻断" : "风险提示"}
              description={form.blockedRiskMessage || undefined}
              icon={form.blockedRiskMessage ? undefined : <TriangleAlert className="h-4 w-4" />}
              className="rounded-[8px]"
            >
              {form.displayWarnings.length ? (
                <ul className="space-y-1 text-xs">
                  {form.displayWarnings.map((w, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </DaaSurfaceNoticeBox>
          ) : null}

          <DaaSurfaceActionButton
            tone={side === "BUY" ? "success" : "danger"}
            className={cn(
              "h-11 w-full justify-center rounded-[8px] border-transparent text-sm font-semibold text-white shadow-sm",
              side === "BUY"
                ? "bg-emerald-500 hover:bg-emerald-600"
                : "bg-red-500 hover:bg-red-600",
            )}
            onClick={async () => {
              await form.handleSubmit();
              props.onOrderCompleted?.();
            }}
            disabled={!form.canSubmit}
          >
            {props.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {props.submitting ? "执行中…" : side === "BUY" ? `买入 ${row.symbol}` : `卖出 ${row.symbol}`}
          </DaaSurfaceActionButton>
        </div>
      ) : null}
      </div>
    </div>
  );
}
