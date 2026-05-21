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
    <div className="overflow-hidden rounded-[14px] border border-[#1a222a] bg-[#0b0f13] text-[#d6dde5]">
      <div className="flex items-center justify-between border-b border-[#151b22] px-3 py-2.5">
        <div>
          <div className="text-sm font-semibold text-[#f3f6f8]">交易</div>
          <div className="mt-0.5 font-[var(--font-mono)] text-[11px] text-[#59636f]">{row.symbol} · {row.market}</div>
        </div>
        <DaaSurfaceStatusPill tone={form.inputModeTone} className="rounded-[6px] px-2 py-0.5 text-[10px] normal-case tracking-normal">
          {form.inputModeLabel}
        </DaaSurfaceStatusPill>
      </div>

      <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 rounded-[8px] bg-[#050607] p-1">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={cn(
            "h-8 rounded-[6px] text-sm font-semibold transition-colors",
            side === "BUY"
              ? "bg-[#10251c] text-[#00c076]"
              : "text-[#8a939f] hover:text-[#d6dde5]",
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
              ? "bg-[#2a1117] text-[#f84960]"
              : "text-[#8a939f] hover:text-[#d6dde5]",
          )}
        >
          卖出
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {["市价", "限价", "拆单"].map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={mode !== "市价"}
            className={cn(
              "h-7 rounded-[6px] border text-[11px] font-medium transition-colors",
              mode === "市价"
                ? "border-[#2a333d] bg-[#151c23] text-[#d6dde5]"
                : "cursor-not-allowed border-[#151b22] bg-[#080b0e] text-[#59636f]",
            )}
            title={mode === "市价" ? "当前执行模式" : "后续接入对应订单类型"}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="rounded-[10px] border border-[#1a222a] bg-[#050607] px-3 py-2.5">
        <div className="flex items-center justify-between text-xs text-[#8a939f]">
          <span>成交价</span>
          <span className="font-[var(--font-mono)] text-sm text-[#d6dde5]">{row.lastPrice.toFixed(4)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-[#59636f]">
          <span>市价单 · {row.currency}</span>
          <span className="font-[var(--font-mono)]">{slippageBps.toFixed(0)} bps</span>
        </div>
      </div>

      {/* 数量输入 */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-[#8a939f]">
          数量
        </label>
        <div className="flex h-10 items-center rounded-[8px] border border-[#252d36] bg-[#050607] px-3 focus-within:border-[#3a4653]">
          <input
            type="number"
            min="0"
            step="0.000001"
            value={form.qty}
            onChange={(e) => form.handleQtyChange(e.target.value)}
            placeholder="输入数量"
            className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-sm text-[#f3f6f8] outline-none placeholder:text-[#59636f]"
          />
          <span className="ml-2 shrink-0 font-[var(--font-mono)] text-[11px] text-[#8a939f]">{row.symbol}</span>
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
            className="h-7 rounded-[6px] border border-[#1a222a] bg-[#080b0e] text-xs font-medium text-[#8a939f] transition-colors hover:border-[#2a333d] hover:text-[#d6dde5]"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 金额输入 */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-[#8a939f]">
          金额 ({row.currency})
        </label>
        <div className="flex h-10 items-center rounded-[8px] border border-[#252d36] bg-[#050607] px-3 focus-within:border-[#3a4653]">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.notional}
            onChange={(e) => form.handleNotionalChange(e.target.value)}
            placeholder="输入金额"
            className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-sm text-[#f3f6f8] outline-none placeholder:text-[#59636f]"
          />
          <span className="ml-2 shrink-0 font-[var(--font-mono)] text-[11px] text-[#8a939f]">{row.currency}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#8a939f]">
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
            "h-11 w-full justify-center rounded-[8px] border-transparent text-sm font-semibold",
            side === "BUY"
              ? "bg-[#a3ff12] text-black hover:bg-[#b7ff3e]"
              : "bg-[#f84960] text-white hover:bg-[#ff6377]",
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
        <div className="space-y-3 rounded-[10px] border border-[#1a222a] bg-[#050607] p-3">
          <div className="flex items-center justify-between border-b border-[#151b22] pb-2">
            <span className="text-xs font-semibold text-[#d6dde5]">订单预览</span>
            <span className={cn("font-[var(--font-mono)] text-xs", side === "BUY" ? "text-[#00c076]" : "text-[#f84960]")}>
              {actionLabel} {row.symbol}
            </span>
          </div>
          <div className="divide-y divide-[#111820] text-xs">
            {[
              ["成交数量", form.preview.qty.toFixed(6)],
              ["名义金额", `${form.preview.currency} ${form.preview.grossNotional.toFixed(2)}`],
              ["手续费 / 滑点", `${form.preview.currency} ${(form.preview.fee + previewSlippageCost).toFixed(4)}`],
              [side === "BUY" ? "预估占用" : "成交后持仓", side === "BUY" ? formatCurrency(previewTotalCost, form.preview.currency) : projectedHoldingQty.toFixed(6)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-2">
                <span className="text-[#8a939f]">{label}</span>
                <span className="font-[var(--font-mono)] text-[#d6dde5]">{value}</span>
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
              "h-11 w-full justify-center rounded-[8px] border-transparent text-sm font-semibold",
              side === "BUY"
                ? "bg-[#a3ff12] text-black hover:bg-[#b7ff3e]"
                : "bg-[#f84960] text-white hover:bg-[#ff6377]",
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
