"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  DaaSurfaceActionButton,
  daaSurfaceFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { appendCashLedgerEntry } from "@/src/daa/modules/store/dashboardStoreApiClient";
import { cn } from "@/lib/utils";

interface PortfolioCashEntryPopoverProps {
  side: "deposit" | "withdraw";
  baseCurrency: string;
  onSuccess: () => void;
  className?: string;
  /** 可选受控开关；不传则组件自管状态 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PortfolioCashEntryPopover({ side, baseCurrency, onSuccess, className, open: openProp, onOpenChange }: PortfolioCashEntryPopoverProps) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? Boolean(openProp) : openState;
  const setOpen = useCallback((next: boolean) => {
    if (!controlled) setOpenState(next);
    onOpenChange?.(next);
  }, [controlled, onOpenChange]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    inputRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setAmount("");
    setNote("");
  }, [setOpen]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("请输入大于 0 的金额");
      return;
    }
    setSubmitting(true);
    try {
      await appendCashLedgerEntry({
        side,
        amount: value,
        baseCurrency,
        note: note.trim() || undefined,
      });
      toast.success(side === "deposit" ? "入金已记录" : "出金已记录");
      closeAndReset();
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, amount, note, side, baseCurrency, closeAndReset, onSuccess]);

  const tone = side === "deposit" ? "success" : "warning";
  const label = side === "deposit" ? "入金" : "出金";

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <DaaSurfaceActionButton
        tone={tone}
        className="w-full justify-center"
        onClick={() => setOpen(!open)}
      >
        {label}
      </DaaSurfaceActionButton>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[300px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[rgba(13,19,32,0.98)] shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <div className="border-b border-[var(--border)] px-3.5 py-2.5">
            <div className="text-sm font-semibold text-[var(--text)]">{label}</div>
            <div className="mt-0.5 text-[11px] text-[var(--faint)]">{side === "deposit" ? "记录一笔入金到账户" : "记录一笔出金从账户"}</div>
          </div>
          <div className="space-y-2.5 px-3.5 py-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]">金额 ({baseCurrency})</span>
              <input
                ref={inputRef}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSubmit(); } }}
                placeholder="例如 10000"
                className={cn(daaSurfaceFieldClassName, "h-10")}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]">备注（可选）</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={side === "deposit" ? "例如：工资入账" : "例如：转出账户"}
                className={cn(daaSurfaceFieldClassName, "h-10")}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3.5 py-2.5">
            <DaaSurfaceActionButton tone="slate" onClick={closeAndReset} className="h-8 text-xs">取消</DaaSurfaceActionButton>
            <DaaSurfaceActionButton
              tone={tone}
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="h-8 text-xs"
            >
              {submitting ? "提交中…" : "确认"}
            </DaaSurfaceActionButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
