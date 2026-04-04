"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceMiniStat,
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

  const sideTone = side === "BUY" ? "green" : "amber";

  return (
    <div className="space-y-3 rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4">
      {/* BUY / SELL tab */}
      <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-[rgba(255,255,255,0.04)] p-1">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={cn(
            "rounded-[10px] py-2 text-sm font-semibold transition-colors",
            side === "BUY"
              ? "bg-emerald-500/20 text-emerald-400"
              : "text-[var(--muted)] hover:text-[var(--text)]",
          )}
        >
          买入
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={cn(
            "rounded-[10px] py-2 text-sm font-semibold transition-colors",
            side === "SELL"
              ? "bg-red-500/20 text-red-400"
              : "text-[var(--muted)] hover:text-[var(--text)]",
          )}
        >
          卖出
        </button>
      </div>

      {/* 当前价格 */}
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>价格 ({row.currency})</span>
        <span className="font-[var(--font-mono)] text-sm text-[var(--text)]">
          {row.lastPrice.toFixed(4)}
        </span>
      </div>

      {/* 数量输入 */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">
          数量
        </label>
        <input
          type="number"
          min="0"
          step="0.000001"
          value={form.qty}
          onChange={(e) => form.handleQtyChange(e.target.value)}
          placeholder="输入数量"
          className="h-10 w-full rounded-[10px] border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-3 font-[var(--font-mono)] text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--primary)]"
        />
      </div>

      {/* 快捷比例按钮 */}
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
            className="rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.04)] py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--text)]"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 金额输入 */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">
          金额 ({row.currency})
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.notional}
          onChange={(e) => form.handleNotionalChange(e.target.value)}
          placeholder="输入金额"
          className="h-10 w-full rounded-[10px] border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-3 font-[var(--font-mono)] text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--primary)]"
        />
      </div>

      {/* 可用余额 / 持仓 */}
      <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
        {side === "BUY" ? (
          <span>可用 {formatCurrency(availableCash, "USD")}</span>
        ) : (
          <span>可卖 {row.holdingQty % 1 === 0 ? row.holdingQty.toLocaleString() : row.holdingQty.toFixed(4)}</span>
        )}
        <DaaSurfaceStatusPill tone={form.inputModeTone}>{form.inputModeLabel}</DaaSurfaceStatusPill>
      </div>

      {/* 预览按钮 */}
      {!form.preview ? (
        <DaaSurfaceActionButton
          tone="primary"
          className="h-10 w-full justify-center rounded-[12px]"
          onClick={() => void form.handlePreview()}
          disabled={!form.canPreview}
        >
          {form.previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {form.previewLoading ? "预览中…" : "生成预览"}
        </DaaSurfaceActionButton>
      ) : null}

      {/* 错误 */}
      {form.error ? (
        <DaaSurfaceNoticeBox tone="red" title="预览失败" description={form.error} />
      ) : null}

      {/* 预览结果 */}
      {form.preview ? (
        <div className="space-y-3 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.72)] p-3">
          <div className="grid grid-cols-2 gap-2">
            <DaaSurfaceMiniStat label="成交数量" value={form.preview.qty.toFixed(6)} tone="cyan" />
            <DaaSurfaceMiniStat
              label="名义金额"
              value={`${form.preview.currency} ${form.preview.grossNotional.toFixed(2)}`}
              tone="amber"
            />
            <DaaSurfaceMiniStat
              label="手续费"
              value={`${form.preview.currency} ${form.preview.fee.toFixed(4)}`}
              tone="slate"
            />
            <DaaSurfaceMiniStat
              label="总成本"
              value={formatCurrency(
                form.preview.fee + form.preview.grossNotional * (slippageBps / 10000),
                form.preview.currency,
              )}
              tone="red"
            />
          </div>

          {/* 风控提示 */}
          {form.blockedRiskMessage || form.displayWarnings.length ? (
            <DaaSurfaceNoticeBox
              tone={form.blockedRiskMessage ? "red" : "amber"}
              title={form.blockedRiskMessage ? "风控阻断" : "风险提示"}
              description={form.blockedRiskMessage || undefined}
              icon={form.blockedRiskMessage ? undefined : <TriangleAlert className="h-4 w-4" />}
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

          {/* 确认执行 */}
          <DaaSurfaceActionButton
            tone={side === "BUY" ? "success" : "warning"}
            className="h-10 w-full justify-center rounded-[12px]"
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
  );
}
