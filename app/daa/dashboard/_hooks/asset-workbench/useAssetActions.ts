"use client";

import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { PortfolioWorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchReadModel";
import type { CalibrationDraft, OrderDraft } from "@/app/daa/dashboard/_hooks/asset-workbench/assetWorkbenchTypes";
import { isVisibleHolding } from "@/app/daa/dashboard/_shared/holdingVisibility";
import {
  addWatchlistAsset,
  buildCalibrationDraft,
  buildManualExecutionInput,
  createManualOrderDraft,
  parseCalibrationDraft,
  removeFromWatchlist,
  restoreWatchlistAsset,
  submitNormalizedTargetWeights,
  submitTargetWeightUpdate,
  toggleBasketMembership,
} from "@/app/daa/dashboard/_hooks/asset-workbench/assetActionCommands";
import {
  executeWorkbenchOrder,
  listWorkbenchFeaturedAssets,
  patchWorkbenchAsset,
  previewWorkbenchExecution,
  searchWorkbenchAssets,
  upsertWorkbenchAsset,
} from "@/src/daa/modules/workbench/workbenchApi";
import type {
  AssetUniverseView,
  WorkbenchBootstrap,
  WorkbenchFeaturedAssetItem,
  WorkbenchFeaturedAssetsResult,
  WorkbenchMarketOrderPreviewResult,
  WorkbenchSearchAssetResult,
} from "@/src/daa/modules/workbench/workbenchTypes";

export function useAssetActions(input: {
  bootstrap: WorkbenchBootstrap | null;
  assetRows: AssetUniverseView[];
  loading: boolean;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  loadBootstrap: (silent?: boolean, preferredCycleId?: string | null) => Promise<void>;
  setActiveTab: Dispatch<SetStateAction<PortfolioWorkbenchTab>>;
}) {
  const [targetUpdating, setTargetUpdating] = useState(false);
  const [assetActioningKey, setAssetActioningKey] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<OrderDraft>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>(null);
  const [calibrating, setCalibrating] = useState(false);
  // 使用 ref 稳定 input 引用，避免 useCallback 依赖整个 input 对象导致回调不稳定
  const inputRef = useRef(input);
  inputRef.current = input;

  const joinedAssetKeys = useMemo(() => {
    const out: Record<string, true> = {};
    for (const row of input.assetRows) {
      if (!row.watchEnabled) continue;
      out[row.assetKey] = true;
    }
    return out;
  }, [input.assetRows]);

  const handleAddManualOrder = useCallback(async (row: AssetUniverseView, side: "BUY" | "SELL") => {
    const result = createManualOrderDraft({
      bootstrapReady: Boolean(input.bootstrap),
      busy: input.busy,
      row,
      side,
    });
    if (!result.ok) {
      if (result.message) toast.error(result.message);
      return;
    }
    setOrderDraft(result.draft);
  }, [input.bootstrap, input.busy]);

  const handlePreviewOrder = useCallback(async (payload: {
    assetKey: string;
    side: "BUY" | "SELL";
    qty?: number;
    notional?: number;
  }) => previewWorkbenchExecution(payload), []);

  const handleSubmitManualOrder = useCallback(async (preview: WorkbenchMarketOrderPreviewResult) => {
    if (inputRef.current.busy || orderSubmitting) return;
    setOrderSubmitting(true);
    inputRef.current.setBusy(true);
    try {
      const result = await executeWorkbenchOrder(buildManualExecutionInput(preview));
      if (result.result.status === "executed" || result.result.status === "submitted" || result.result.status === "partially_filled") {
        const successText = result.result.status === "executed"
          ? `${preview.symbol} 执行成功`
          : `${preview.symbol} 订单已提交`;
        toast.success(successText);
      } else {
        toast.error(result.result.rejectMessage || `${preview.symbol} 执行失败`);
      }
      await inputRef.current.loadBootstrap(true);
      setOrderDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "执行失败");
    } finally {
      setOrderSubmitting(false);
      inputRef.current.setBusy(false);
    }
  }, [orderSubmitting]);

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
    role?: string;
    market: string;
    assetClass: string;
    theme?: string;
    limitPerRole?: number;
  }): Promise<WorkbenchFeaturedAssetsResult> => listWorkbenchFeaturedAssets({
    role: payload.role,
    market: payload.market,
    assetClass: payload.assetClass,
    theme: payload.theme,
    limitPerRole: payload.limitPerRole,
  }), []);

  const handleAddWatchlistAsset = useCallback(async (item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) => {
    const result = await addWatchlistAsset({ item, upsertWorkbenchAsset });
    toast.success(result.message);
    await inputRef.current.loadBootstrap(true);
  }, []);

  const handleRemoveWatchlistAssetItem = useCallback(async (item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) => {
    const market = String(item.market || "").trim().toUpperCase();
    const symbol = String(item.symbol || "").trim().toUpperCase();
    if (!market || !symbol || assetActioningKey) return;
    const key = `${market}::${symbol}`;
    setAssetActioningKey(key);
    try {
      await patchWorkbenchAsset(key, { watchEnabled: false, targetWeightHint: 0 });
      toast.success(`${item.displayNameZh || item.name || item.symbol} 已移出观察列表`);
      await inputRef.current.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移除观察失败");
    } finally {
      setAssetActioningKey(null);
    }
  }, [assetActioningKey]);

  const handleRemoveFromWatchlist = useCallback(async (row: AssetUniverseView) => {
    if (assetActioningKey) return;
    setAssetActioningKey(row.assetKey);
    try {
      const result = await removeFromWatchlist({ row, patchWorkbenchAsset });
      toast.success(result.message, {
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              const restored = await restoreWatchlistAsset({ row, patchWorkbenchAsset });
              toast.success(restored.message);
              await inputRef.current.loadBootstrap(true);
            } catch {
              toast.error("撤销失败，请手动重新添加");
            }
          },
        },
      });
      await inputRef.current.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移除观察失败");
    } finally {
      setAssetActioningKey(null);
    }
  }, [assetActioningKey]);

  const handleToggleBasket = useCallback(async (row: AssetUniverseView, nextInBasket: boolean) => {
    if (assetActioningKey) return;
    setAssetActioningKey(row.assetKey);
    try {
      const result = await toggleBasketMembership({ row, nextInBasket, patchWorkbenchAsset });
      toast.success(result.message);
      await input.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新再平衡列表失败");
    } finally {
      setAssetActioningKey(null);
    }
  }, [assetActioningKey]);

  const handleOpenCalibration = useCallback((row: AssetUniverseView) => {
    setCalibrationDraft(buildCalibrationDraft(row));
  }, []);

  const handleSubmitCalibration = useCallback(async () => {
    if (!calibrationDraft || calibrating || inputRef.current.busy) return;
    const parsed = parseCalibrationDraft(calibrationDraft);
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }

    setCalibrating(true);
    try {
      await patchWorkbenchAsset(calibrationDraft.row.assetKey, parsed.patch);
      toast.success(`${calibrationDraft.row.symbol} 持仓已校准`);
      setCalibrationDraft(null);
      await inputRef.current.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "校准失败");
    } finally {
      setCalibrating(false);
    }
  }, [calibrating, calibrationDraft]);

  const handleUpdateTargetWeight = useCallback(async (row: AssetUniverseView, targetWeightPct: number) => {
    setTargetUpdating(true);
    try {
      const result = await submitTargetWeightUpdate({ row, targetWeightPct, patchWorkbenchAsset });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await inputRef.current.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "目标权重更新失败");
    } finally {
      setTargetUpdating(false);
    }
  }, []);

  const handleNormalizeTargetWeights = useCallback(async () => {
    setTargetUpdating(true);
    try {
      const result = await submitNormalizedTargetWeights({
        rows: inputRef.current.assetRows,
        patchWorkbenchAsset,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await inputRef.current.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "归一化失败");
    } finally {
      setTargetUpdating(false);
    }
  }, []);

  const tableProps = {
    rows: input.assetRows,
    baseCurrency: input.bootstrap?.baseCurrency ?? "USD",
    counts: {
      all: input.assetRows.filter((row) => row.watchEnabled || isVisibleHolding(row)).length,
      holdings: input.assetRows.filter(isVisibleHolding).length,
      watchlist: input.assetRows.filter((row) => row.watchEnabled).length,
      basket: input.assetRows.filter((row) => row.watchEnabled && row.targetWeightPct > 0).length,
    },
    onAddToExecution: handleAddManualOrder,
    onUpdateTargetWeight: handleUpdateTargetWeight,
    onNormalizeTargetWeights: handleNormalizeTargetWeights,
    onToggleBasket: handleToggleBasket,
    onRemoveFromWatchlist: handleRemoveFromWatchlist,
    onOpenCalibration: handleOpenCalibration,
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
    onRemoveAsset: handleRemoveWatchlistAssetItem,
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
    handlePreviewOrder,
    handleSubmitManualOrder,
    handleSubmitCalibration,
    tableProps,
    watchlistBuilderProps,
  };
}
