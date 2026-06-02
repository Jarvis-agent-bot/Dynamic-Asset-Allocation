"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/src/daa/api/client";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { AssetKlineChart } from "@/app/daa/dashboard/_shared/AssetKlineChart";
import { usePriceStream } from "@/app/daa/dashboard/_hooks/usePriceStream";
import { useSparklines } from "@/app/daa/dashboard/_hooks/useSparklines";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { buildManualExecutionInput } from "@/app/daa/dashboard/_hooks/dashboard/assetActionCommands";
import { cn } from "@/lib/utils";
import { getAssetDetailReadModel } from "@/src/daa/modules/read/readApi";
import { executeWorkbenchOrder, patchWorkbenchAsset, previewWorkbenchExecution } from "@/src/daa/modules/workbench/workbenchApi";
import type { AssetDetailReadModel } from "@/src/daa/modules/read/readModels";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

import { AssetInfoBar } from "./AssetInfoBar";
import { AssetDetailTabs } from "./AssetDetailTabs";
import { InlineTradePanel } from "./InlineTradePanel";
import { AssetPositionPanel } from "./AssetPositionPanel";

function priceStatusTone(status: string) {
  if (status === "fresh") return "green" as const;
  if (status === "stale") return "amber" as const;
  if (status === "missing" || status === "unsupported") return "red" as const;
  return "slate" as const;
}

function priceStatusLabel(status: string) {
  if (status === "fresh") return "实时";
  if (status === "stale") return "延迟";
  if (status === "missing") return "缺失";
  if (status === "unsupported") return "不支持";
  return "未知";
}

function AssetTradeContextPanel(props: {
  row: AssetUniverseView;
  baseCurrency: string;
}) {
  const { row, baseCurrency } = props;
  const targetPct = row.targetWeightPct ?? (row.targetWeightHint ?? 0) * 100;
  const gapPct = row.gapPct ?? 0;
  const absGap = Math.abs(gapPct);
  const gapTone = absGap >= 5 ? "text-[var(--danger)]" : absGap >= 2 ? "text-[var(--amber)]" : "text-[var(--success)]";
  const actualBarWidth = `${Math.min(100, Math.max(0, row.actualWeightPct ?? 0))}%`;
  const targetBarLeft = `${Math.min(100, Math.max(0, targetPct))}%`;
  const rows = [
    { label: "价格时间", value: formatDateTime(row.priceUpdatedAt) },
    { label: "市值", value: formatCurrency(row.valuationBase ?? 0, baseCurrency) },
    { label: "当前 / 目标", value: `${row.actualWeightPct.toFixed(2)}% / ${targetPct.toFixed(2)}%` },
    { label: "价格源", value: row.priceSource || "--" },
    { label: "FX", value: row.fxMissing ? "缺失" : row.fxRateToBase ? row.fxRateToBase.toFixed(6) : "--" },
  ];

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <h3 className="text-sm font-semibold text-[var(--text)]">市场摘要</h3>
        <DaaSurfaceStatusPill tone={priceStatusTone(row.priceStatus)} className="rounded-[6px] px-2 py-0.5 text-[10px] normal-case tracking-normal">
          {priceStatusLabel(row.priceStatus)}
        </DaaSurfaceStatusPill>
      </div>
      <div className="p-3">
        <div className="mb-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-[var(--muted)]">组合权重</span>
            <span className={cn("font-[var(--font-mono)]", gapTone)}>偏离 {gapPct.toFixed(2)}%</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-[var(--elevated)]">
            <div className="absolute inset-y-0 left-0 bg-[var(--primary)]" style={{ width: actualBarWidth }} />
            <div
              className="absolute inset-y-[-3px] w-px bg-[var(--text)]"
              style={{ left: targetBarLeft }}
              title={`目标 ${targetPct.toFixed(2)}%`}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-[var(--font-mono)] text-[10px] text-[var(--faint)]">
            <span>当前 {row.actualWeightPct.toFixed(2)}%</span>
            <span>目标 {targetPct.toFixed(2)}%</span>
          </div>
        </div>
        <div className="divide-y divide-[var(--border)] text-xs">
          {rows.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-2">
              <span className="text-[var(--muted)]">{item.label}</span>
              <span className="truncate text-right font-[var(--font-mono)] text-[var(--text)]">{item.value}</span>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-2">
            <span className="text-[var(--muted)]">漂移状态</span>
            <span className={cn("text-right font-[var(--font-mono)]", gapTone)}>
              {absGap >= 5 ? "显著偏离" : absGap >= 2 ? "中度偏离" : "贴近目标"}
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-2">
            <span className="text-[var(--muted)]">价格年龄</span>
            <span className="text-right font-[var(--font-mono)] text-[var(--text)]">
              {row.priceAgeSec == null ? "--" : `${Math.round(row.priceAgeSec / 60)}m`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssetTradingPageClient(props: { assetKey: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<AssetDetailReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [targetUpdating, setTargetUpdating] = useState(false);

  const loadDetail = useCallback(async (fresh = false) => {
    if (fresh) setRefreshing(true);
    else {
      setLoading(true);
      setDetail(null);
    }
    setError("");
    try {
      setDetail(await getAssetDetailReadModel({
        assetKey: props.assetKey,
        fresh,
      }));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      if (fresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [props.assetKey]);

  useEffect(() => {
    void loadDetail(false);
  }, [loadDetail]);

  const row = detail?.row ?? null;
  const baseCurrency = detail?.baseCurrency || "USD";
  const slippageBps = detail?.execution.slippageBps ?? 0;
  const availableCashValue = Math.max(0, (detail?.account.cash ?? 0) - (detail?.account.frozenCash ?? 0));
  const tradeMarkers = detail?.tradeMarkers ?? [];
  const sparklineSymbols = useMemo(() => row ? [row.yfinanceSymbol || row.symbol] : [], [row]);
  const sparklines = useSparklines(sparklineSymbols);
  const sparkData = row ? (sparklines[row.yfinanceSymbol || row.symbol] ?? sparklines[row.symbol] ?? null) : null;
  const priceStreamAssetKeys = useMemo(() => row ? [row.assetKey] : [], [row]);
  const priceStream = usePriceStream(priceStreamAssetKeys);
  const livePrice = row ? priceStream.prices.get(row.assetKey) ?? null : null;

  // 成本价（单价）
  const costBasisPerShare = useMemo(() => {
    if (!row || row.holdingQty <= 0 || !row.costBasis || row.costBasis <= 0) return null;
    return row.costBasis / row.holdingQty;
  }, [row]);

  const handlePreviewOrder = useCallback((payload: {
    assetKey: string;
    side: "BUY" | "SELL";
    qty?: number;
    notional?: number;
    sellAll?: boolean;
  }) => previewWorkbenchExecution(payload), []);

  const handleSubmitOrder = useCallback(async (preview: Awaited<ReturnType<typeof previewWorkbenchExecution>>) => {
    if (orderSubmitting) return;
    setOrderSubmitting(true);
    try {
      const result = await executeWorkbenchOrder(buildManualExecutionInput(preview));
      if (result.result.status === "executed" || result.result.status === "submitted" || result.result.status === "partially_filled") {
        toast.success(result.result.status === "executed" ? `${preview.symbol} 执行成功` : `${preview.symbol} 订单已提交`);
      } else {
        toast.error(result.result.rejectMessage || `${preview.symbol} 执行失败`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "执行失败");
    } finally {
      setOrderSubmitting(false);
    }
  }, [orderSubmitting]);

  const handleUpdateTargetWeight = useCallback(async (targetWeightPct: number) => {
    if (!row || targetUpdating) return;
    if (!Number.isFinite(targetWeightPct) || targetWeightPct < 0 || targetWeightPct > 100) {
      toast.error("目标权重必须在 0 到 100% 之间");
      return;
    }
    setTargetUpdating(true);
    try {
      const updatedRow = await patchWorkbenchAsset(row.assetKey, {
        targetWeightHint: targetWeightPct / 100,
        watchEnabled: true,
      });
      setDetail((prev) => prev ? { ...prev, row: updatedRow } : prev);
      toast.success(`${row.symbol} 目标权重已更新为 ${targetWeightPct.toFixed(2)}%`);
      void loadDetail(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "目标权重更新失败");
    } finally {
      setTargetUpdating(false);
    }
  }, [loadDetail, row, targetUpdating]);

  const tradeCallbacks = useMemo(() => ({
    onPreview: handlePreviewOrder,
    onSubmit: handleSubmitOrder,
  }), [handlePreviewOrder, handleSubmitOrder]);

  if (loading && !detail) {
    return (
      <div className="flex items-center justify-center gap-2 py-20">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
        <span className="text-sm text-[var(--muted)]">加载资产数据…</span>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="space-y-4 py-12 text-center">
        <div className="text-sm text-red-300">{error}</div>
        <button
          type="button"
          onClick={() => void loadDetail(true)}
          className="rounded-[10px] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--elevated)]"
        >
          重新加载
        </button>
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
          className="rounded-[10px] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--elevated)]"
        >
          返回持仓列表
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 顶部信息栏 */}
      <AssetInfoBar row={row} baseCurrency={baseCurrency} sparkData={sparkData} />

      {/* 主体：左 K 线 + 右交易区 */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* 左侧：K 线图 */}
        <SectionErrorBoundary sectionName="K线图">
          <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-strong)] bg-[#050607] shadow-[0_18px_42px_rgba(15,23,42,0.14)]">
            <AssetKlineChart
              symbol={row.yfinanceSymbol || row.symbol}
              market={row.market}
              className="min-h-[520px]"
              tradeMarkers={tradeMarkers}
              costBasisPerShare={costBasisPerShare}
              livePrice={livePrice}
            />
          </div>
        </SectionErrorBoundary>

        {/* 右侧：交易面板 + 持仓上下文 */}
        <div className="space-y-3 xl:sticky xl:top-3">
          <SectionErrorBoundary sectionName="持仓状态">
            <AssetPositionPanel
              row={row}
              onUpdateTargetWeight={handleUpdateTargetWeight}
              updating={targetUpdating}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="交易面板">
            <InlineTradePanel
              row={row}
              availableCash={availableCashValue}
              slippageBps={slippageBps}
              submitting={orderSubmitting || refreshing}
              callbacks={tradeCallbacks}
              onOrderCompleted={() => void loadDetail(true)}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="交易上下文">
            <AssetTradeContextPanel row={row} baseCurrency={baseCurrency} />
          </SectionErrorBoundary>
        </div>
      </div>

      {/* 底部：交易所式证据区 */}
      <SectionErrorBoundary sectionName="资产详情">
        <AssetDetailTabs row={row} />
      </SectionErrorBoundary>
    </div>
  );
}
