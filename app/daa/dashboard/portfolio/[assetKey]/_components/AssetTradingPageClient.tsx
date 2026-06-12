"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/src/daa/api/client";
import { WorkbenchLoadingState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { AssetKlineChart } from "@/app/daa/dashboard/_shared/AssetKlineChart";
import { usePriceStream } from "@/app/daa/dashboard/_hooks/usePriceStream";
import { useSparklines } from "@/app/daa/dashboard/_hooks/useSparklines";
import { buildManualExecutionInput } from "@/app/daa/dashboard/_hooks/asset-workbench/assetActionCommands";
import { getAssetDetailReadModel } from "@/src/daa/modules/read/readApi";
import { executeWorkbenchOrder, patchWorkbenchAsset, previewWorkbenchExecution } from "@/src/daa/modules/workbench/workbenchApi";
import type { AssetDetailReadModel } from "@/src/daa/modules/read/readModels";

import { AssetInfoBar } from "./AssetInfoBar";
import { AssetDetailTabs } from "./AssetDetailTabs";
import { InlineTradePanel } from "./InlineTradePanel";
import { AssetPositionPanel } from "./AssetPositionPanel";

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
  const displayRow = useMemo(() => {
    if (!row || !livePrice) return row;
    const holdingQty = Number(row.holdingQty || 0);
    const fxRateToBase = Number(row.fxRateToBase || 0);
    const valuationBase = holdingQty > 0 && fxRateToBase > 0
      ? holdingQty * livePrice.price * fxRateToBase
      : row.valuationBase;
    const costBasisInBase = Number(row.costBasisInBase ?? 0);
    const unrealizedPnlBase = valuationBase != null && costBasisInBase > 0
      ? valuationBase - costBasisInBase
      : row.unrealizedPnlBase;
    const unrealizedPnlPct = unrealizedPnlBase != null && costBasisInBase > 0
      ? (unrealizedPnlBase / costBasisInBase) * 100
      : row.unrealizedPnlPct;

    return {
      ...row,
      lastPrice: livePrice.price,
      priceUpdatedAt: livePrice.ts,
      priceStatus: "fresh" as const,
      priceSource: livePrice.source || row.priceSource,
      priceAgeSec: 0,
      priceDelta: livePrice.delta,
      priceDirection: livePrice.direction,
      valuationBase,
      unrealizedPnlBase,
      unrealizedPnlPct,
    };
  }, [row, livePrice]);

  // 成本价（单价）
  const costBasisPerShare = useMemo(() => {
    if (!displayRow || displayRow.holdingQty <= 0 || !displayRow.costBasis || displayRow.costBasis <= 0) return null;
    return displayRow.costBasis / displayRow.holdingQty;
  }, [displayRow]);

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
    if (!displayRow || targetUpdating) return;
    if (!Number.isFinite(targetWeightPct) || targetWeightPct < 0 || targetWeightPct > 100) {
      toast.error("目标权重必须在 0 到 100% 之间");
      return;
    }
    setTargetUpdating(true);
    try {
      const updatedRow = await patchWorkbenchAsset(displayRow.assetKey, {
        targetWeightHint: targetWeightPct / 100,
        watchEnabled: true,
      });
      setDetail((prev) => prev ? { ...prev, row: updatedRow } : prev);
      toast.success(`${displayRow.symbol} 目标权重已更新为 ${targetWeightPct.toFixed(2)}%`);
      void loadDetail(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "目标权重更新失败");
    } finally {
      setTargetUpdating(false);
    }
  }, [displayRow, loadDetail, targetUpdating]);

  const tradeCallbacks = useMemo(() => ({
    onPreview: handlePreviewOrder,
    onSubmit: handleSubmitOrder,
  }), [handlePreviewOrder, handleSubmitOrder]);

  if (loading && !detail) {
    return <WorkbenchLoadingState title="正在加载资产详情" description="同步行情、持仓、目标权重与交易记录。" />;
  }

  if (error && !detail) {
    return (
      <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-4">
        <div className="text-sm font-medium text-[var(--danger)]">{error}</div>
        <button
          type="button"
          onClick={() => void loadDetail(true)}
          className="rounded-[var(--radius-sm)] border border-[var(--danger-border)] px-3 py-1.5 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--surface)]"
        >
          重新加载
        </button>
      </div>
    );
  }

  // 未找到资产
  if (!displayRow) {
    return (
      <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <div className="text-sm font-medium text-[var(--text)]">
          未找到资产 <span className="font-[var(--font-mono)]">{props.assetKey}</span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/daa/dashboard/portfolio")}
          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--text)]"
        >
          返回持仓列表
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 顶部信息栏 */}
      <AssetInfoBar row={displayRow} baseCurrency={baseCurrency} sparkData={sparkData} />

      {/* 主体：左 K 线 + 右交易区 */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* 左侧：K 线图 */}
        <SectionErrorBoundary sectionName="K线图">
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)]">
            <AssetKlineChart
              symbol={displayRow.yfinanceSymbol || displayRow.symbol}
              market={displayRow.market}
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
              row={displayRow}
              baseCurrency={baseCurrency}
              targetWeightAudits={detail?.targetWeightAudits ?? []}
              onUpdateTargetWeight={handleUpdateTargetWeight}
              updating={targetUpdating}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="交易面板">
            <InlineTradePanel
              row={displayRow}
              availableCash={availableCashValue}
              slippageBps={slippageBps}
              submitting={orderSubmitting || refreshing}
              callbacks={tradeCallbacks}
              onOrderCompleted={() => void loadDetail(true)}
            />
          </SectionErrorBoundary>
        </div>
      </div>

      {/* 底部：交易所式依据区 */}
      <SectionErrorBoundary sectionName="资产详情">
        <AssetDetailTabs row={displayRow} />
      </SectionErrorBoundary>
    </div>
  );
}
