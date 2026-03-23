"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import type { AssetUniverseView, WorkbenchMarketOrderPreviewResult } from "@/src/daa/modules/workbench/workbenchTypes";

import {
  DeepLedgerActionButton,
  DeepLedgerDialogShell,
  DeepLedgerMiniStat,
  DeepLedgerNoticeBox,
  DeepLedgerStatusPill,
  deepLedgerFieldClassName,
  deepLedgerMonoPanelClassName,
  deepLedgerSubtlePanelClassName,
} from "../../_components/DeepLedgerUI";

function formatMaybeAmount(currency: string, value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return `${currency} --`;
  return `${currency} ${value.toFixed(digits)}`;
}

export default function MarketOrderDialog(props: {
  open: boolean;
  row: AssetUniverseView | null;
  side: "BUY" | "SELL";
  loading?: boolean;
  onOpenChange: (next: boolean) => void;
  onPreview: (input: { assetKey: string; side: "BUY" | "SELL"; qty?: number; notional?: number }) => Promise<WorkbenchMarketOrderPreviewResult>;
  onSubmit: (preview: WorkbenchMarketOrderPreviewResult) => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [notional, setNotional] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<WorkbenchMarketOrderPreviewResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.open) {
      setQty("");
      setNotional("");
      setPreview(null);
      setError("");
      setPreviewLoading(false);
    }
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    setQty("");
    setNotional("");
    setPreview(null);
    setError("");
    setPreviewLoading(false);
  }, [props.open, props.row?.assetKey, props.side]);

  const qtyNum = useMemo(() => {
    const n = Number(qty);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [qty]);

  const notionalNum = useMemo(() => {
    const n = Number(notional);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [notional]);

  const blockedRiskMessage = useMemo(() => {
    return preview?.riskCheck?.items.find((item) => item.status === "block")?.message || "";
  }, [preview]);
  const inputIdBase = useMemo(() => {
    const raw = props.row?.assetKey || `${props.side.toLowerCase()}-market-order`;
    return `market-order-${raw.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`;
  }, [props.row?.assetKey, props.side]);

  const displayWarnings = useMemo(() => {
    if (!preview) return [] as string[];
    if (!blockedRiskMessage) return preview.warnings;
    return preview.warnings.filter((item) => !item.includes(blockedRiskMessage));
  }, [blockedRiskMessage, preview]);

  function resetPreviewState() {
    if (preview) setPreview(null);
    if (error) setError("");
  }

  async function handlePreview() {
    if (!props.row || previewLoading) return;
    if (!(qtyNum > 0) && !(notionalNum > 0)) {
      setError("请输入数量或金额，且至少一个字段大于 0。");
      return;
    }

    setError("");
    setPreviewLoading(true);
    try {
      const res = await props.onPreview({
        assetKey: props.row.assetKey,
        side: props.side,
        qty: qtyNum > 0 ? qtyNum : undefined,
        notional: notionalNum > 0 ? notionalNum : undefined,
      });
      setPreview(res);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSubmit() {
    if (!preview || props.loading) return;
    await props.onSubmit(preview);
    props.onOpenChange(false);
  }

  const sideTone = props.side === "BUY" ? "success" : "warning";
  const inputModeTone = qtyNum > 0 ? "green" : notionalNum > 0 ? "amber" : "slate";
  const inputModeLabel = qtyNum > 0 ? "按数量预估" : notionalNum > 0 ? "按金额预估" : "等待输入";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DeepLedgerDialogShell
        accent={props.side === "BUY" ? "green" : "amber"}
        className="max-w-[940px] max-h-[min(88dvh,860px)] sm:max-h-[min(90dvh,860px)]"
        title={`${props.side === "BUY" ? "市价买入" : "市价卖出"} ${props.row?.symbol || ""}`}
        description="系统优先使用最近一次成功写入的可用行情做预览；修改输入后会自动清空旧预览，避免旧价格或旧数量被误提交。"
        badges={(
          <>
            <DeepLedgerStatusPill tone={props.side === "BUY" ? "green" : "amber"}>
              {props.side === "BUY" ? "BUY TICKET" : "SELL TICKET"}
            </DeepLedgerStatusPill>
            {props.row ? <DeepLedgerStatusPill tone="slate">{props.row.market} · {props.row.currency}</DeepLedgerStatusPill> : null}
          </>
        )}
        bodyClassName="min-h-0 space-y-4 pr-1 sm:pr-2"
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <DeepLedgerActionButton tone="slate" className="justify-center rounded-[12px] px-4 py-2.5" onClick={() => props.onOpenChange(false)}>
              取消
            </DeepLedgerActionButton>
            <DeepLedgerActionButton
              tone={sideTone}
              className="justify-center rounded-[12px] px-4 py-2.5"
              onClick={() => void handleSubmit()}
              disabled={!preview || props.loading || preview.canSubmit === false}
            >
              {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {props.loading ? "执行中..." : "确认执行"}
            </DeepLedgerActionButton>
          </div>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(168px,0.6fr)] lg:items-end">
          <label className="space-y-2" htmlFor={`${inputIdBase}-qty`}>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">数量 Qty</span>
            <input
              id={`${inputIdBase}-qty`}
              name="qty"
              value={qty}
              onChange={(e) => {
                const value = e.target.value;
                resetPreviewState();
                setQty(value);
                if (Number(value) > 0) setNotional("");
              }}
              placeholder="例如 1.5"
              type="number"
              min="0"
              step="0.000001"
              className={cn(deepLedgerFieldClassName, "h-11")}
            />
          </label>
          <label className="space-y-2" htmlFor={`${inputIdBase}-notional`}>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">金额 Notional</span>
            <input
              id={`${inputIdBase}-notional`}
              name="notional"
              value={notional}
              onChange={(e) => {
                const value = e.target.value;
                resetPreviewState();
                setNotional(value);
                if (Number(value) > 0) setQty("");
              }}
              placeholder="例如 1000"
              type="number"
              min="0"
              step="0.01"
              className={cn(deepLedgerFieldClassName, "h-11")}
            />
          </label>
          <DeepLedgerActionButton
            tone="primary"
            className="h-11 justify-center rounded-[14px] px-4"
            onClick={() => void handlePreview()}
            disabled={previewLoading || (!(qtyNum > 0) && !(notionalNum > 0))}
          >
            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {previewLoading ? "预览中..." : "生成预览"}
          </DeepLedgerActionButton>
        </div>

        <div className={cn(deepLedgerSubtlePanelClassName, "space-y-3 px-4 py-3.5")}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <DeepLedgerStatusPill tone={inputModeTone}>{inputModeLabel}</DeepLedgerStatusPill>
            <DeepLedgerStatusPill tone={props.side === "BUY" ? "green" : "amber"}>{props.side === "BUY" ? "买入建仓" : "卖出减仓"}</DeepLedgerStatusPill>
            {preview ? <DeepLedgerStatusPill tone="slate">输入变更将自动清空旧预览</DeepLedgerStatusPill> : null}
            <span>数量和金额二选一；继续输入另一项时，当前项会自动清空，避免与后端预览优先级冲突。</span>
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
                <div key={item.label} className={cn(deepLedgerSubtlePanelClassName, "px-3.5 py-3")}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{item.label}</div>
                  <div className="mt-2 text-sm font-semibold leading-5 text-[var(--text)]">{item.value}</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{item.hint}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs leading-5 text-[var(--muted)]">
              预览成功后，关键数字会压缩到右侧统计区；如果你修改数量或金额，旧预览会立即失效，必须重新生成预览才能继续执行。
            </div>
          )}
        </div>

        {error ? <DeepLedgerNoticeBox tone="red" title="预览失败" description={error} /> : null}

        {preview ? (
          <div className="space-y-3 rounded-[18px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.94),rgba(8,12,20,0.96))] p-4 sm:p-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] xl:items-start">
              <div className={cn(deepLedgerSubtlePanelClassName, "space-y-3 px-4 py-4")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">Preview Ledger</div>
                    <div className="font-[var(--font-display)] text-[24px] leading-none tracking-[-0.03em] text-[var(--text)] sm:text-[26px]">
                      {preview.currency} {preview.price.toFixed(4)}
                    </div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[var(--faint)]">
                      {props.row?.symbol || preview.symbol} · {props.row?.market || preview.market} · {props.side === "BUY" ? "买入" : "卖出"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <DeepLedgerStatusPill tone={preview.canSubmit ? "green" : "red"}>
                      {preview.canSubmit ? "可执行" : "执行受限"}
                    </DeepLedgerStatusPill>
                    <DeepLedgerStatusPill tone={inputModeTone}>{inputModeLabel}</DeepLedgerStatusPill>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className={cn(deepLedgerMonoPanelClassName, "min-h-[82px] px-3 py-2 leading-5")}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">行情来源</div>
                    <div className="mt-1 break-all font-[var(--font-body)] text-xs leading-5 text-[var(--text)]">{preview.priceSource}</div>
                  </div>
                  <div className={cn(deepLedgerMonoPanelClassName, "min-h-[82px] px-3 py-2 leading-5")}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">快照时间</div>
                    <div className="mt-1 font-[var(--font-body)] text-xs leading-5 text-[var(--text)]">{formatDateTime(preview.priceSnapshotAt)}</div>
                  </div>
                </div>

                <div className="text-[11px] leading-5 text-[var(--faint)]">
                  价格快照用于解释预览来源，不等于最终成交时间；提交前仍会再次执行风控检查。
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DeepLedgerMiniStat label="成交数量" value={preview.qty.toFixed(6)} tone="cyan" />
                <DeepLedgerMiniStat label="名义金额" value={`${preview.currency} ${preview.grossNotional.toFixed(4)}`} tone="amber" />
                <DeepLedgerMiniStat
                  label="基准币折算"
                  value={formatMaybeAmount(preview.baseCurrency, preview.notionalInBase)}
                  hint={preview.fxRateToBase == null ? "缺少有效汇率，当前仅可预览不可执行" : `汇率 ${preview.fxRateToBase.toFixed(6)}` }
                  tone="indigo"
                />
                <DeepLedgerMiniStat
                  label="手续费"
                  value={`${preview.currency} ${preview.fee.toFixed(4)}`}
                  hint={preview.feeRateBps != null ? `费率 ${preview.feeRateBps.toFixed(2)} bps` : "使用默认费率"}
                  tone="slate"
                />
              </div>
            </div>

            {blockedRiskMessage || displayWarnings.length ? (
              <DeepLedgerNoticeBox
                tone={blockedRiskMessage ? "red" : "amber"}
                title={blockedRiskMessage ? "当前交易将被风控阻断" : "风险提示（执行前建议复核）"}
                description={blockedRiskMessage || undefined}
                icon={blockedRiskMessage ? undefined : <TriangleAlert className="h-4 w-4" />}
              >
                {displayWarnings.length ? (
                  <ul className="grid gap-2 text-sm md:grid-cols-2">
                    {displayWarnings.map((item, idx) => (
                      <li
                        key={`w-${idx}`}
                        className={cn(
                          "flex gap-2 rounded-[12px] border px-3 py-2",
                          blockedRiskMessage
                            ? "border-rose-300/12 bg-[rgba(255,255,255,0.02)] text-rose-100"
                            : "border-amber-300/12 bg-[rgba(255,255,255,0.02)] text-amber-100",
                        )}
                      >
                        <span className={cn("mt-[6px] h-1.5 w-1.5 rounded-full", blockedRiskMessage ? "bg-rose-300" : "bg-amber-300")} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </DeepLedgerNoticeBox>
            ) : null}
          </div>
        ) : null}
      </DeepLedgerDialogShell>
    </Dialog>
  );
}
