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
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">交易</div>
          <div className="mt-0.5 font-[var(--font-mono)] text-[11px] text-[var(--faint)]">{row.symbol} · {row.market}</div>
        </div>
        <DaaSurfaceStatusPill tone={form.inputModeTone} className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[10px] normal-case tracking-normal">
          {form.inputModeLabel}
        </DaaSurfaceStatusPill>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 rounded-[var(--radius-md)] bg-[var(--elevated)] p-1">
          <button
            type="button"
            onClick={() => setSide("BUY")}
            className={cn(
              "h-8 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors",
              side === "BUY"
                ? "bg-[var(--success-bg)] text-[var(--success)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            买入
          </button>
          <button
            type="button"
            onClick={() => setSide("SELL")}
            className={cn(
              "h-8 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors",
              side === "SELL"
                ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            卖出
          </button>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>成交价</span>
            <span className="font-[var(--font-mono)] text-sm text-[var(--text)]">{row.lastPrice.toFixed(4)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--faint)]">
            <span>本地模拟执行 · {row.currency}</span>
            <span className="font-[var(--font-mono)]">{slippageBps.toFixed(0)} bps</span>
          </div>
        </div>

        {/* 数量输入 */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--muted)]">
            数量
          </label>
          <div className="flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] px-3 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary-bg)]">
            <input
              type="number"
              min="0"
              step="0.000001"
              value={form.qty}
              onChange={(e) => form.handleQtyChange(e.target.value)}
              placeholder="输入数量"
              className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-sm text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
            />
            <span className="ml-2 shrink-0 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">{row.symbol}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              onClick={() => form.handleShortcut({
                holdingQty: row.holdingQty,
                availableCash,
                lastPrice: row.lastPrice,
                pct: shortcut.pct,
              })}
              className="h-7 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            >
              {shortcut.label}
            </button>
          ))}
        </div>

        {/* 金额输入 */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--muted)]">
            金额 ({row.currency})
          </label>
          <div className="flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] px-3 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary-bg)]">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.notional}
              onChange={(e) => form.handleNotionalChange(e.target.value)}
              placeholder="输入金额"
              className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-sm text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
            />
            <span className="ml-2 shrink-0 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">{row.currency}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
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
              "h-11 w-full justify-center rounded-[var(--radius-sm)] border-transparent text-sm font-semibold",
              side === "BUY"
                ? "bg-[var(--success)] text-white hover:opacity-90"
                : "bg-[var(--danger)] text-white hover:opacity-90",
            )}
            onClick={() => void form.handlePreview()}
            disabled={!form.canPreview}
          >
            {form.previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {form.previewLoading ? "预览中…" : "生成预览"}
          </DaaSurfaceActionButton>
        ) : null}

        {form.error ? (
          <DaaSurfaceNoticeBox tone="danger" title="预览失败" description={form.error} className="rounded-[var(--radius-md)]" />
        ) : null}

        {form.preview ? (
          <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <span className="text-xs font-semibold text-[var(--text)]">订单预览</span>
              <span className={cn("font-[var(--font-mono)] text-xs", side === "BUY" ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                {actionLabel} {row.symbol}
              </span>
            </div>
            <div className="divide-y divide-[var(--border)] text-xs">
              {[
                ["成交数量", form.preview.qty.toFixed(6)],
                ["名义金额", `${form.preview.currency} ${form.preview.grossNotional.toFixed(2)}`],
                ["手续费 / 滑点", `${form.preview.currency} ${(form.preview.fee + previewSlippageCost).toFixed(4)}`],
                [side === "BUY" ? "预估占用" : "成交后持仓", side === "BUY" ? formatCurrency(previewTotalCost, form.preview.currency) : projectedHoldingQty.toFixed(6)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2">
                  <span className="text-[var(--muted)]">{label}</span>
                  <span className="font-[var(--font-mono)] text-[var(--text)]">{value}</span>
                </div>
              ))}
            </div>

            {form.blockedRiskMessage || form.displayWarnings.length ? (
              <DaaSurfaceNoticeBox
                tone={form.blockedRiskMessage ? "danger" : "warning"}
                title={form.blockedRiskMessage ? "风控阻断" : "风险提示"}
                description={form.blockedRiskMessage || undefined}
                icon={form.blockedRiskMessage ? undefined : <TriangleAlert className="h-4 w-4" />}
                className="rounded-[var(--radius-md)]"
              >
                {form.displayWarnings.length ? (
                  <ul className="space-y-1 text-xs">
                    {form.displayWarnings.map((warningMessage, warningIndex) => (
                      <li key={warningIndex} className="flex gap-1.5">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[var(--amber)]" />
                        <span>{warningMessage}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </DaaSurfaceNoticeBox>
            ) : null}

            <DaaSurfaceActionButton
              tone={side === "BUY" ? "success" : "danger"}
              className={cn(
                "h-11 w-full justify-center rounded-[var(--radius-sm)] border-transparent text-sm font-semibold",
                side === "BUY"
                  ? "bg-[var(--success)] text-white hover:opacity-90"
                  : "bg-[var(--danger)] text-white hover:opacity-90",
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
