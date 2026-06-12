"use client";

import { useMemo } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { useTradeForm, type TradeFormCallbacks } from "@/app/daa/dashboard/_hooks/useTradeForm";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import type { AssetUniverseView, WorkbenchMarketOrderPreviewResult } from "@/src/daa/modules/workbench/workbenchTypes";

import {
  DaaSurfaceActionButton,
  DaaSurfaceDialogShell,
  DaaSurfaceNoticeBox,
  DaaSurfaceStatusPill,
  daaSurfaceFieldClassName,
  daaSurfaceMonoPanelClassName,
  daaSurfaceSubtlePanelClassName,
} from "../_components/DaaSurfaceUI";

function formatMaybeAmount(currency: string, value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return `${currency} --`;
  return `${currency} ${value.toFixed(digits)}`;
}

function TradePreviewMetric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
}) {
  const valueClassName = {
    primary: "text-[var(--primary)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--amber)]",
    danger: "text-[var(--danger)]",
    info: "text-[var(--indigo)]",
    neutral: "text-[var(--text)]",
  }[tone];

  return (
    <div className="grid gap-2 border-b border-[var(--elevated)] px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(92px,0.55fr)_minmax(0,1fr)] sm:items-start">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">{label}</div>
        {hint ? <div className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{hint}</div> : null}
      </div>
      <div className={cn("break-all text-right font-[var(--font-mono)] text-sm leading-5 sm:text-left", valueClassName)}>
        {value}
      </div>
    </div>
  );
}

export default function MarketOrderDialog(props: {
  open: boolean;
  row: AssetUniverseView | null;
  side: "BUY" | "SELL";
  loading?: boolean;
  slippageBps?: number;
  onOpenChange: (next: boolean) => void;
  onPreview: (input: { assetKey: string; side: "BUY" | "SELL"; qty?: number; notional?: number; sellAll?: boolean }) => Promise<WorkbenchMarketOrderPreviewResult>;
  onSubmit: (preview: WorkbenchMarketOrderPreviewResult) => Promise<void>;
}) {
  const inputIdBase = useMemo(() => {
    const raw = props.row?.assetKey || `${props.side.toLowerCase()}-market-order`;
    return `market-order-${raw.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`;
  }, [props.row?.assetKey, props.side]);

  const tradeFormCallbacks = useMemo<TradeFormCallbacks>(() => ({
    onPreview: props.onPreview,
    onSubmit: async (preview) => {
      await props.onSubmit(preview);
      props.onOpenChange(false);
    },
  }), [props.onOpenChange, props.onPreview, props.onSubmit]);

  const tradeForm = useTradeForm({
    assetKey: props.row?.assetKey ?? null,
    side: props.side,
    callbacks: tradeFormCallbacks,
    submitting: props.loading,
    resetKey: props.open,
  });

  const {
    qty,
    notional,
    preview,
    previewLoading,
    error,
    blockedRiskMessage,
    displayWarnings,
    inputModeLabel,
    inputModeTone,
    canPreview,
    canSubmit,
    handleQtyChange,
    handleNotionalChange,
    handlePreview,
    handleSubmit,
  } = tradeForm;

  const sideTone = props.side === "BUY" ? "success" : "warning";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DaaSurfaceDialogShell
        accent={props.side === "BUY" ? "success" : "warning"}
        className="max-w-[940px] max-h-[min(88dvh,860px)] sm:max-h-[min(90dvh,860px)]"
        title={`${props.side === "BUY" ? "市价买入" : "市价卖出"} ${props.row?.symbol || ""}`}
        description="使用最近可用行情预览；提交前重新校验价格与风控。"
        badges={(
          <>
            <DaaSurfaceStatusPill tone={props.side === "BUY" ? "success" : "warning"}>
              {props.side === "BUY" ? "BUY TICKET" : "SELL TICKET"}
            </DaaSurfaceStatusPill>
            {props.row ? <DaaSurfaceStatusPill tone="neutral">{props.row.market} · {props.row.currency}</DaaSurfaceStatusPill> : null}
          </>
        )}
        bodyClassName="min-h-0 space-y-4 pr-1 sm:pr-2"
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <DaaSurfaceActionButton tone="neutral" className="justify-center rounded-[var(--radius-sm)] px-4 py-2" onClick={() => props.onOpenChange(false)}>
              取消
            </DaaSurfaceActionButton>
            <DaaSurfaceActionButton
              tone={sideTone}
              className="justify-center rounded-[var(--radius-sm)] px-4 py-2"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {props.loading ? "执行中..." : "确认执行"}
            </DaaSurfaceActionButton>
          </div>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(168px,0.6fr)] lg:items-end">
          <label className="space-y-2" htmlFor={`${inputIdBase}-qty`}>
            <span className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">数量 Qty</span>
            <input
              id={`${inputIdBase}-qty`}
              name="qty"
              value={qty}
              onChange={(event) => handleQtyChange(event.target.value)}
              placeholder="例如 1.5"
              type="number"
              min="0"
              step="0.000001"
              className={cn(daaSurfaceFieldClassName, "h-11")}
            />
          </label>
          <label className="space-y-2" htmlFor={`${inputIdBase}-notional`}>
            <span className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">金额 Notional</span>
            <input
              id={`${inputIdBase}-notional`}
              name="notional"
              value={notional}
              onChange={(event) => handleNotionalChange(event.target.value)}
              placeholder="例如 1000"
              type="number"
              min="0"
              step="0.01"
              className={cn(daaSurfaceFieldClassName, "h-11")}
            />
          </label>
          <DaaSurfaceActionButton
            tone="primary"
            className="h-10 justify-center rounded-[var(--radius-sm)] px-4"
            onClick={() => void handlePreview()}
            disabled={!props.row || !canPreview}
          >
            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {previewLoading ? "预览中..." : "生成预览"}
          </DaaSurfaceActionButton>
        </div>

        <div className={cn(daaSurfaceSubtlePanelClassName, "space-y-3 px-4 py-3.5")}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <DaaSurfaceStatusPill tone={inputModeTone}>{inputModeLabel}</DaaSurfaceStatusPill>
            <DaaSurfaceStatusPill tone={props.side === "BUY" ? "success" : "warning"}>{props.side === "BUY" ? "买入建仓" : "卖出减仓"}</DaaSurfaceStatusPill>
            {preview ? <DaaSurfaceStatusPill tone="neutral">输入变更将自动清空旧预览</DaaSurfaceStatusPill> : null}
            <span>数量和金额二选一；继续输入另一项时，当前项会自动清空，避免预览规则不一致。</span>
          </div>

          {!preview ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                {
                  label: "输入策略",
                  value: "数量 / 金额二选一",
                  hint: "系统会自动补足另一维",
                },
                {
                  label: "执行门槛",
                  value: "预览通过后开放执行",
                  hint: "未重新预览前不会提交",
                },
                {
                  label: "风险复核",
                  value: props.side === "BUY" ? "买入前检查现金与集中度" : "卖出前检查持仓与集中度",
                  hint: "颜色之外还会显示明确文字提示",
                },
              ].map((item) => (
                <div key={item.label} className={cn(daaSurfaceSubtlePanelClassName, "px-3.5 py-3")}>
                  <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">{item.label}</div>
                  <div className="mt-2 text-sm font-semibold leading-5 text-[var(--text)]">{item.value}</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{item.hint}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs leading-5 text-[var(--muted)]">
              预览成功后显示关键数字；修改数量或金额后需重新预览。
            </div>
          )}
        </div>

        {error ? <DaaSurfaceNoticeBox tone="danger" title="预览失败" description={error} /> : null}

        {preview ? (
          <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] xl:items-start">
              <div className={cn(daaSurfaceSubtlePanelClassName, "space-y-3 px-4 py-4")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">Preview Ledger</div>
                    <div className="text-[24px] font-semibold leading-none text-[var(--text)] sm:text-[26px]">
                      {preview.currency} {preview.price.toFixed(4)}
                    </div>
                    <div className="text-xs uppercase tracking-normal text-[var(--faint)]">
                      {props.row?.symbol || preview.symbol} · {props.row?.market || preview.market} · {props.side === "BUY" ? "买入" : "卖出"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <DaaSurfaceStatusPill tone={preview.canSubmit ? "success" : "danger"}>
                      {preview.canSubmit ? "可执行" : "执行受限"}
                    </DaaSurfaceStatusPill>
                    <DaaSurfaceStatusPill tone={inputModeTone}>{inputModeLabel}</DaaSurfaceStatusPill>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className={cn(daaSurfaceMonoPanelClassName, "min-h-[82px] px-3 py-2 leading-5")}>
                    <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">行情来源</div>
                    <div className="mt-1 break-all font-[var(--font-body)] text-xs leading-5 text-[var(--text)]">{preview.priceSource}</div>
                  </div>
                  <div className={cn(daaSurfaceMonoPanelClassName, "min-h-[82px] px-3 py-2 leading-5")}>
                    <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">快照时间</div>
                    <div className="mt-1 font-[var(--font-body)] text-xs leading-5 text-[var(--text)]">{formatDateTime(preview.priceSnapshotAt)}</div>
                  </div>
                </div>

                <div className="text-[11px] leading-5 text-[var(--faint)]">
                  价格快照用于解释预览来源，不等于最终成交时间；提交前仍会再次执行风控检查。
                </div>
              </div>

              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--elevated)] bg-[var(--surface)]">
                <TradePreviewMetric label="成交数量" value={preview.qty.toFixed(6)} tone="primary" />
                <TradePreviewMetric label="名义金额" value={`${preview.currency} ${preview.grossNotional.toFixed(4)}`} tone="warning" />
                <TradePreviewMetric
                  label="基准币折算"
                  value={formatMaybeAmount(preview.baseCurrency, preview.notionalInBase)}
                  hint={preview.fxRateToBase == null ? "缺少有效汇率，当前仅可预览不可执行" : `汇率 ${preview.fxRateToBase.toFixed(6)}` }
                  tone="info"
                />
                <TradePreviewMetric
                  label="手续费"
                  value={`${preview.currency} ${preview.fee.toFixed(4)}`}
                  hint={preview.feeRateBps != null ? `费率 ${preview.feeRateBps.toFixed(2)} bps` : "使用默认费率"}
                  tone="neutral"
                />
                <TradePreviewMetric
                  label="滑点预估"
                  value={formatCurrency(
                    preview.grossNotional * ((props.slippageBps ?? 0) / 10000),
                    preview.currency
                  )}
                  hint={`${props.slippageBps ?? 0} bps`}
                  tone="warning"
                />
                <TradePreviewMetric
                  label="总交易成本"
                  value={formatCurrency(
                    preview.fee + preview.grossNotional * ((props.slippageBps ?? 0) / 10000),
                    preview.currency
                  )}
                  tone="danger"
                />
              </div>
            </div>

            {blockedRiskMessage || displayWarnings.length ? (
              <DaaSurfaceNoticeBox
                tone={blockedRiskMessage ? "danger" : "warning"}
                title={blockedRiskMessage ? "当前交易将被风控阻断" : "风险提示（执行前建议复核）"}
                description={blockedRiskMessage || undefined}
                icon={blockedRiskMessage ? undefined : <TriangleAlert className="h-4 w-4" />}
              >
                {displayWarnings.length ? (
                  <ul className="grid gap-2 text-sm md:grid-cols-2">
                    {displayWarnings.map((item, warningIndex) => (
                      <li
                        key={`warning-${warningIndex}`}
                        className={cn(
                          "flex gap-2 rounded-[var(--radius-sm)] border px-3 py-2",
                          blockedRiskMessage
                            ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]"
                            : "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]",
                        )}
                      >
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </DaaSurfaceNoticeBox>
            ) : null}
          </div>
        ) : null}
      </DaaSurfaceDialogShell>
    </Dialog>
  );
}
