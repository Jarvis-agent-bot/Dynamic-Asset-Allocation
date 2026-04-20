"use client";

import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import type { CalibrationDraft, OrderDraft } from "@/app/daa/dashboard/_hooks/dashboard/dashboardPageTypes";
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
  setActiveTab: Dispatch<SetStateAction<DashboardTab>>;
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
    if (inputRef.current.busy || orderSubmitting) return;
    setOrderSubmitting(true);
    inputRef.current.setBusy(true);
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
        reasonText: "来自市价预览",
      });
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
        onClick: () => inputRef.current.setActiveTab("watchlist"),
      },
    });
    await inputRef.current.loadBootstrap(true);
  }, []);

  const handleRemoveFromWatchlist = useCallback(async (row: AssetUniverseView) => {
    if (assetActioningKey) return;
    setAssetActioningKey(row.assetKey);
    try {
      await patchWorkbenchAsset(row.assetKey, { watchEnabled: false, targetWeightHint: 0 });
      toast.success(`${row.symbol} 已移出观察列表`, {
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await patchWorkbenchAsset(row.assetKey, { watchEnabled: true });
              toast.success(`${row.symbol} 已恢复到观察列表`);
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
  }, [assetActioningKey]);

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
    if (!calibrationDraft || calibrating || inputRef.current.busy) return;
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
      await inputRef.current.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "校准失败");
    } finally {
      setCalibrating(false);
    }
  }, [calibrating, calibrationDraft]);

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
      await inputRef.current.loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "目标权重更新失败");
    } finally {
      setTargetUpdating(false);
    }
  }, []);

  const handleNormalizeTargetWeights = useCallback(async () => {
    const watchRows = inputRef.current.assetRows.filter((row) => row.watchEnabled);
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
    handlePreviewOrder,
    handleSubmitManualOrder,
    handleSubmitCalibration,
    tableProps,
    watchlistBuilderProps,
  };
}
