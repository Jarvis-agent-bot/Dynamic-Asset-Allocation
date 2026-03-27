"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import type { CalibrationDraft, OrderDraft } from "@/app/daa/dashboard/_hooks/workbench/workbenchPageTypes";
import {
  executeWorkbenchOrder,
  getWorkbenchAssetInsights,
  listWorkbenchFeaturedAssets,
  patchWorkbenchAsset,
  previewWorkbenchExecution,
  searchWorkbenchAssets,
  submitWorkbenchLlmFeedback,
  upsertWorkbenchAsset,
} from "@/src/daa/modules/workbench/workbenchApi";
import type {
  AssetUniverseView,
  WorkbenchAssetInsightResponse,
  WorkbenchBootstrap,
  WorkbenchFeaturedAssetItem,
  WorkbenchFeaturedAssetsResult,
  WorkbenchLlmFeedbackScore,
  WorkbenchMarketOrderPreviewResult,
  WorkbenchSearchAssetResult,
} from "@/src/daa/modules/workbench/workbenchTypes";

export function useWorkbenchAssetActions(input: {
  bootstrap: WorkbenchBootstrap | null;
  assetRows: AssetUniverseView[];
  loading: boolean;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  loadBootstrap: (silent?: boolean, preferredCycleId?: string | null) => Promise<void>;
  setActiveTab: Dispatch<SetStateAction<WorkbenchTab>>;
}) {
  const [targetUpdating, setTargetUpdating] = useState(false);
  const [assetActioningKey, setAssetActioningKey] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<OrderDraft>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [expandedInsightKeys, setExpandedInsightKeys] = useState<Record<string, boolean>>({});
  const [insightLoadingByAssetKey, setInsightLoadingByAssetKey] = useState<Record<string, boolean>>({});
  const [insightErrorByAssetKey, setInsightErrorByAssetKey] = useState<Record<string, string>>({});
  const [insightDataByAssetKey, setInsightDataByAssetKey] = useState<Record<string, WorkbenchAssetInsightResponse>>({});
  const [llmFeedbackSubmittingByContext, setLlmFeedbackSubmittingByContext] = useState<Record<string, boolean>>({});
  const [llmFeedbackScoreByContext, setLlmFeedbackScoreByContext] = useState<Record<string, WorkbenchLlmFeedbackScore>>({});
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>(null);
  const [calibrating, setCalibrating] = useState(false);
  const insightPrefetchedRef = useRef<Record<string, true>>({});

  useEffect(() => {
    if (!input.bootstrap) return;
    const seeds = input.assetRows
      .filter((row) => row.holdingQty > 0 || row.watchEnabled)
      .slice(0, 8);
    for (const row of seeds) {
      if (insightPrefetchedRef.current[row.assetKey]) continue;
      insightPrefetchedRef.current[row.assetKey] = true;
      setInsightLoadingByAssetKey((prev) => ({ ...prev, [row.assetKey]: true }));
      void getWorkbenchAssetInsights(row.assetKey, {
        analysisFocus: input.bootstrap.rebalanceStrategy.analysisFocus,
        includeLlm: false,
      }).then((data) => {
        setInsightDataByAssetKey((prev) => ({ ...prev, [row.assetKey]: data }));
      }).catch((err) => {
        logSwallowed("useWorkbenchAssetActions.prefetchInsight", err);
      }).finally(() => {
        setInsightLoadingByAssetKey((prev) => ({ ...prev, [row.assetKey]: false }));
      });
    }
  }, [input.assetRows, input.bootstrap]);

  const joinedAssetKeys = useMemo(() => {
    const out: Record<string, true> = {};
    for (const row of input.assetRows) {
      if (!row.watchEnabled) continue;
      out[row.assetKey] = true;
    }
    return out;
  }, [input.assetRows]);

  const handleAddManualOrder = useCallback(async (row: AssetUniverseView, side: "BUY" | "SELL") => {
    if (!input.bootstrap || input.busy) return;
    if (side === "SELL" && row.holdingQty <= 0) {
      toast.error(`${row.symbol} 无可卖持仓`);
      return;
    }
    setOrderDraft({ row, side });
  }, [input.bootstrap, input.busy]);

  const handlePreviewOrder = useCallback(async (payload: {
    assetKey: string;
    side: "BUY" | "SELL";
    qty?: number;
    notional?: number;
  }) => previewWorkbenchExecution(payload), []);

  const handleSubmitManualOrder = useCallback(async (preview: WorkbenchMarketOrderPreviewResult) => {
    if (input.busy || orderSubmitting) return;
    setOrderSubmitting(true);
    input.setBusy(true);
    try {
      const result = await executeWorkbenchOrder({
        source: "manual",
        origin: "manual",
        side: preview.side,
        assetKey: preview.assetKey,
        symbol: preview.symbol,
        market: preview.market,
        currency: preview.currency,
        qty: preview.qty,
        price: preview.price,
        notionalInBase: preview.notionalInBase,
        fee: preview.fee,
        pricingMode: "market",
        priceSource: preview.priceSource,
        priceSnapshotAt: preview.priceSnapshotAt ?? undefined,
        reasonText: "来自工作台市价预览",
      });
      if (result.result.status === "executed" || result.result.status === "submitted" || result.result.status === "partially_filled") {
        const successText = result.result.status === "executed"
          ? `${preview.symbol} 执行成功`
          : `${preview.symbol} 订单已提交`;
        toast.success(successText);
      } else {
        toast.error(result.result.rejectMessage || `${preview.symbol} 执行失败`);
      }
      await input.loadBootstrap(true);
      setOrderDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "执行失败");
    } finally {
      setOrderSubmitting(false);
      input.setBusy(false);
    }
  }, [input, orderSubmitting]);

  const handleSearchAssets = useCallback(async (payload: {
    q: string;
    market: string;
    assetClass: string;
    region: string;
  }): Promise<WorkbenchSearchAssetResult[]> => searchWorkbenchAssets({
    q: payload.q,
    market: payload.market,
    assetClass: payload.assetClass,
    region: payload.region,
    limit: 15,
  }), []);

  const handleListFeaturedAssets = useCallback(async (payload: {
    market: string;
    assetClass: string;
    limitPerMarket?: number;
  }): Promise<WorkbenchFeaturedAssetsResult> => listWorkbenchFeaturedAssets({
    market: payload.market,
    assetClass: payload.assetClass,
    limitPerMarket: payload.limitPerMarket,
  }), []);

  const handleAddWatchlistAsset = useCallback(async (item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) => {
    await upsertWorkbenchAsset({
      symbol: item.symbol,
      market: item.market,
      currency: item.currency,
      assetClass: item.assetClass,
      region: item.region,
      exchange: item.exchange,
      instrumentType: item.instrumentType,
      marketGroup: item.marketGroup,
      watchEnabled: true,
      lastPrice: item.price,
    });
    toast.success(`${item.name || item.symbol} 已加入观察列表`, {
      action: {
        label: "查看观察列表",
        onClick: () => input.setActiveTab("watchlist"),
      },
    });
    await input.loadBootstrap(true);
  }, [input]);

  const handleToggleInlineInsights = useCallback(async (row: AssetUniverseView) => {
    const assetKey = row.assetKey;
    const opened = Boolean(expandedInsightKeys[assetKey]);
    setExpandedInsightKeys((prev) => ({ ...prev, [assetKey]: !opened }));
    if (opened) return;
    // 如果已有 LLM 数据或正在加载则跳过；但如果只有非 LLM prefetch 数据则重新获取含 LLM 的完整数据
    const existing = insightDataByAssetKey[assetKey];
    if (insightLoadingByAssetKey[assetKey]) return;
    if (existing?.llmAnalysis?.status === "ok") return;

    setInsightLoadingByAssetKey((prev) => ({ ...prev, [assetKey]: true }));
    setInsightErrorByAssetKey((prev) => ({ ...prev, [assetKey]: "" }));
    try {
      const data = await getWorkbenchAssetInsights(assetKey, {
        analysisFocus: input.bootstrap?.rebalanceStrategy.analysisFocus,
        includeLlm: true,
      });
      setInsightDataByAssetKey((prev) => ({ ...prev, [assetKey]: data }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载资产洞察失败";
      setInsightErrorByAssetKey((prev) => ({ ...prev, [assetKey]: message }));
      toast.error(message);
    } finally {
      setInsightLoadingByAssetKey((prev) => ({ ...prev, [assetKey]: false }));
    }
  }, [expandedInsightKeys, insightDataByAssetKey, insightLoadingByAssetKey, input.bootstrap?.rebalanceStrategy.analysisFocus]);

  const handleRemoveFromWatchlist = useCallback(async (row: AssetUniverseView) => {
    if (assetActioningKey) return;
    setAssetActioningKey(row.assetKey);
    try {
      await patchWorkbenchAsset(row.assetKey, { watchEnabled: false, targetWeightHint: 0 });
      setExpandedInsightKeys((prev) => ({ ...prev, [row.assetKey]: false }));
      toast.success(`${row.symbol} 已移出观察列表`, {
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await patchWorkbenchAsset(row.assetKey, { watchEnabled: true });
              toast.success(`${row.symbol} 已恢复到观察列表`);
              await input.loadBootstrap(true);
            } catch {
              toast.error("撤销失败，请手动重新添加");
            }
          },
        },
      });
      await input.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移除观察失败");
    } finally {
      setAssetActioningKey(null);
    }
  }, [assetActioningKey, input]);

  const handleSubmitLlmFeedback = useCallback(async (payload: {
    contextId: string;
    type: "insight" | "decision";
    score: WorkbenchLlmFeedbackScore;
    comment?: string;
  }) => {
    if (!payload.contextId) return;
    if (llmFeedbackSubmittingByContext[payload.contextId]) return;
    setLlmFeedbackSubmittingByContext((prev) => ({ ...prev, [payload.contextId]: true }));
    try {
      await submitWorkbenchLlmFeedback({
        contextId: payload.contextId,
        type: payload.type,
        score: payload.score,
      });
      setLlmFeedbackScoreByContext((prev) => ({ ...prev, [payload.contextId]: payload.score }));
      toast.success("已记录反馈");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "反馈提交失败");
    } finally {
      setLlmFeedbackSubmittingByContext((prev) => ({ ...prev, [payload.contextId]: false }));
    }
  }, [llmFeedbackSubmittingByContext]);

  const handleToggleBasket = useCallback(async (row: AssetUniverseView, nextInBasket: boolean) => {
    if (assetActioningKey) return;
    setAssetActioningKey(row.assetKey);
    try {
      await patchWorkbenchAsset(row.assetKey, {
        watchEnabled: true,
        targetWeightHint: nextInBasket ? (row.targetWeightHint > 0 ? row.targetWeightHint : 0.05) : 0,
      });
      toast.success(nextInBasket ? `${row.symbol} 已加入再平衡列表` : `${row.symbol} 已移出再平衡列表`);
      await input.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新再平衡列表失败");
    } finally {
      setAssetActioningKey(null);
    }
  }, [assetActioningKey, input]);

  const handleOpenCalibration = useCallback((row: AssetUniverseView) => {
    const defaultPrice = row.holdingPrice > 0 ? row.holdingPrice : (row.lastPrice > 0 ? row.lastPrice : 0);
    const defaultCostBasis = row.costBasis ?? (row.holdingQty > 0 && defaultPrice > 0 ? row.holdingQty * defaultPrice : 0);
    setCalibrationDraft({
      row,
      qty: row.holdingQty > 0 ? row.holdingQty.toFixed(6) : "0",
      holdingPrice: defaultPrice > 0 ? defaultPrice.toFixed(4) : "0",
      costBasis: defaultCostBasis > 0 ? defaultCostBasis.toFixed(2) : "",
    });
  }, []);

  const handleSubmitCalibration = useCallback(async () => {
    if (!calibrationDraft || calibrating || input.busy) return;
    const qty = Number(calibrationDraft.qty);
    const holdingPrice = Number(calibrationDraft.holdingPrice);
    const costBasisText = calibrationDraft.costBasis.trim();
    const costBasis = costBasisText ? Number(costBasisText) : (qty > 0 && holdingPrice > 0 ? qty * holdingPrice : null);

    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("持仓数量必须是大于等于 0 的数字");
      return;
    }
    if (!Number.isFinite(holdingPrice) || holdingPrice < 0) {
      toast.error("持仓均价必须是大于等于 0 的数字");
      return;
    }
    if (costBasis != null && (!Number.isFinite(costBasis) || costBasis < 0)) {
      toast.error("总成本必须是大于等于 0 的数字");
      return;
    }

    setCalibrating(true);
    try {
      await patchWorkbenchAsset(calibrationDraft.row.assetKey, {
        holdingQty: qty,
        holdingPrice,
        costBasis,
        lastPrice: holdingPrice > 0 ? holdingPrice : undefined,
      });
      toast.success(`${calibrationDraft.row.symbol} 持仓已校准`);
      setCalibrationDraft(null);
      await input.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "校准失败");
    } finally {
      setCalibrating(false);
    }
  }, [calibrating, calibrationDraft, input]);

  const handleUpdateTargetWeight = useCallback(async (row: AssetUniverseView, targetWeightPct: number) => {
    if (!Number.isFinite(targetWeightPct) || targetWeightPct < 0) {
      toast.error("目标权重必须是大于等于 0 的数字");
      return;
    }
    setTargetUpdating(true);
    try {
      await patchWorkbenchAsset(row.assetKey, {
        targetWeightHint: targetWeightPct / 100,
        watchEnabled: true,
      });
      toast.success(`${row.symbol} 目标权重已更新为 ${targetWeightPct.toFixed(2)}%`);
      await input.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "目标权重更新失败");
    } finally {
      setTargetUpdating(false);
    }
  }, [input]);

  const handleNormalizeTargetWeights = useCallback(async () => {
    const watchRows = input.assetRows.filter((row) => row.watchEnabled);
    if (!watchRows.length) {
      toast.error("观察列表为空，无法归一化目标权重");
      return;
    }
    setTargetUpdating(true);
    try {
      const positive = watchRows.map((row) => Math.max(0, Number(row.targetWeightHint || 0)));
      const sum = positive.reduce((acc, value) => acc + value, 0);
      const normalized = sum > 0
        ? positive.map((value) => value / sum)
        : watchRows.map(() => 1 / watchRows.length);
      await Promise.all(watchRows.map((row, index) => patchWorkbenchAsset(row.assetKey, {
        watchEnabled: true,
        targetWeightHint: normalized[index],
      })));
      toast.success(`已归一化 ${watchRows.length} 个观察资产`);
      await input.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "归一化失败");
    } finally {
      setTargetUpdating(false);
    }
  }, [input]);

  const tableProps = {
    rows: input.assetRows,
    baseCurrency: input.bootstrap?.baseCurrency ?? "USD",
    counts: {
      all: input.assetRows.filter((row) => row.watchEnabled || row.holdingQty > 0).length,
      holdings: input.assetRows.filter((row) => row.holdingQty > 0).length,
      watchlist: input.assetRows.filter((row) => row.watchEnabled).length,
      basket: input.assetRows.filter((row) => row.watchEnabled && row.targetWeightHint > 0).length,
    },
    onAddToExecution: handleAddManualOrder,
    onUpdateTargetWeight: handleUpdateTargetWeight,
    onNormalizeTargetWeights: handleNormalizeTargetWeights,
    onToggleBasket: handleToggleBasket,
    onRemoveFromWatchlist: handleRemoveFromWatchlist,
    onOpenCalibration: handleOpenCalibration,
    expandedInsightKeys,
    insightLoadingByAssetKey,
    insightErrorByAssetKey,
    insightDataByAssetKey,
    onToggleInlineInsights: handleToggleInlineInsights,
    onSubmitLlmFeedback: handleSubmitLlmFeedback,
    llmFeedbackSubmittingByContext,
    llmFeedbackScoreByContext,
    actioningAssetKey: assetActioningKey,
    disabled: input.loading || input.busy || Boolean(assetActioningKey),
    updatingTarget: targetUpdating,
  };

  const watchlistBuilderProps = {
    loading: input.loading || input.busy || targetUpdating,
    joinedAssetKeys,
    onListFeaturedAssets: handleListFeaturedAssets,
    onSearch: handleSearchAssets,
    onAddAsset: handleAddWatchlistAsset,
  };

  return {
    targetUpdating,
    assetActioningKey,
    orderDraft,
    setOrderDraft,
    orderSubmitting,
    calibrationDraft,
    setCalibrationDraft,
    calibrating,
    llmFeedbackSubmittingByContext,
    llmFeedbackScoreByContext,
    handleSubmitLlmFeedback,
    handlePreviewOrder,
    handleSubmitManualOrder,
    handleSubmitCalibration,
    tableProps,
    watchlistBuilderProps,
  };
}
