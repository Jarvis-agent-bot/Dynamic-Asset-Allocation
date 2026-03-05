"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Briefcase, Compass, Eye, RefreshCcw, Scale } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { ApiClientErrorV1, getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import {
  executeWorkbenchRebalanceCycleV1,
  executeWorkbenchOrderV1,
  generateWorkbenchRebalanceCycleV1,
  getWorkbenchAssetInsightsV1,
  getWorkbenchBootstrapV1,
  listWorkbenchFeaturedAssetsV1,
  listWorkbenchRebalanceCyclesV1,
  patchWorkbenchAssetV1,
  patchWorkbenchRebalanceCycleV1,
  previewWorkbenchExecutionV1,
  runWorkbenchRiskCheckV1,
  searchWorkbenchAssetsV1,
  upsertWorkbenchAssetV1,
} from "@/src/daa/modules/workbench/workbenchApiV1";
import type {
  AssetUniverseViewV1,
  PreTradeRiskCheckV1,
  RebalanceCycleV1,
  WorkbenchAssetInsightResponseV1,
  WorkbenchBootstrapV1,
  WorkbenchFeaturedAssetsResultV1,
  WorkbenchMarketOrderPreviewResultV1,
  WorkbenchSearchAssetResultV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";

import AssetDiscoveryPanel from "../../portfolio/_components/workbench/AssetDiscoveryPanel";
import AssetUniverseTable from "../../portfolio/_components/workbench/AssetUniverseTable";
import MarketOrderDialog from "../../portfolio/_components/workbench/MarketOrderDialog";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

type WorkbenchTab = "positions" | "watchlist" | "discovery" | "rebalance";

function toWorkbenchErrorMessage(error: unknown): string {
  if (error instanceof ApiClientErrorV1 && error.code === "DB_ERROR") {
    return "工作台数据服务暂时不可用，请稍后重试。";
  }
  return getApiErrorMessageV1(error);
}

function riskStatusLabel(status: PreTradeRiskCheckV1["overallStatus"]) {
  if (status === "block") return "阻断";
  if (status === "warn") return "警告";
  return "通过";
}

function cycleStatusLabel(status: RebalanceCycleV1["status"]): string {
  if (status === "generated") return "已生成";
  if (status === "reviewing") return "审阅中";
  if (status === "executing") return "执行中";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return status;
}

function triggerSourceLabel(source: RebalanceCycleV1["triggerSource"]): string {
  if (source === "calendar") return "定期触发";
  if (source === "drift") return "偏移触发";
  return "手动触发";
}

function riskRuleLabel(rule: string): string {
  if (rule === "max_position") return "单一持仓上限";
  if (rule === "max_order_pct") return "单日交易上限";
  if (rule === "concentration") return "组合集中度";
  if (rule === "stop_loss_breach") return "止损阈值";
  if (rule === "total_weight") return "目标权重合计";
  return rule;
}

function riskItemStatusLabel(status: "pass" | "warn" | "block"): string {
  if (status === "block") return "阻断";
  if (status === "warn") return "警告";
  return "通过";
}

function riskItemClassName(status: "pass" | "warn" | "block"): string {
  if (status === "block") return "border-red-200 bg-red-50";
  if (status === "warn") return "border-amber-200 bg-amber-50";
  return "border-emerald-200 bg-emerald-50";
}

export default function WorkbenchPageClient(props: {
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(() => {
    const t = props.initialTab;
    if (t === "positions" || t === "watchlist" || t === "discovery" || t === "rebalance") return t;
    return "positions";
  });

  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [cycles, setCycles] = useState<RebalanceCycleV1[]>([]);
  const [currentCycle, setCurrentCycle] = useState<RebalanceCycleV1 | null>(null);
  const [riskCheck, setRiskCheck] = useState<PreTradeRiskCheckV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [targetUpdating, setTargetUpdating] = useState(false);
  const [assetActioningKey, setAssetActioningKey] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<{ row: AssetUniverseViewV1; side: "BUY" | "SELL" } | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [expandedInsightKeys, setExpandedInsightKeys] = useState<Record<string, boolean>>({});
  const [insightLoadingByAssetKey, setInsightLoadingByAssetKey] = useState<Record<string, boolean>>({});
  const [insightErrorByAssetKey, setInsightErrorByAssetKey] = useState<Record<string, string>>({});
  const [insightDataByAssetKey, setInsightDataByAssetKey] = useState<Record<string, WorkbenchAssetInsightResponseV1>>({});
  const [pendingExecuteMode, setPendingExecuteMode] = useState<"selected" | "all" | null>(null);
  const [calibrationDraft, setCalibrationDraft] = useState<{
    row: AssetUniverseViewV1;
    qty: string;
    holdingPrice: string;
    costBasis: string;
  } | null>(null);
  const [calibrating, setCalibrating] = useState(false);

  const loadBootstrap = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [nextBootstrap, nextCycles] = await Promise.all([
        getWorkbenchBootstrapV1(),
        listWorkbenchRebalanceCyclesV1(40),
      ]);
      setBootstrap(nextBootstrap);
      setCycles(nextCycles);
      const latestCycle = nextCycles[0] || nextBootstrap.latestCycle || null;
      setCurrentCycle(latestCycle);
      setRiskCheck(latestCycle?.riskCheck || null);
    } catch (err) {
      setError(toWorkbenchErrorMessage(err));
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap(false);
  }, [loadBootstrap]);

  useEffect(() => {
    function onRefresh() {
      void loadBootstrap(true);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, [loadBootstrap]);

  const assetRows = bootstrap?.assetUniverse ?? [];
  const summary = useMemo(() => {
    const totalAssets = assetRows.length;
    const holdingAssets = assetRows.filter((row) => row.holdingQty > 0).length;
    const watchlistAssets = assetRows.filter((row) => row.watchEnabled).length;
    return { totalAssets, holdingAssets, watchlistAssets };
  }, [assetRows]);

  const joinedAssetKeys = useMemo(() => {
    const out: Record<string, true> = {};
    for (const row of assetRows) {
      if (!row.watchEnabled) continue;
      out[row.assetKey] = true;
    }
    return out;
  }, [assetRows]);

  async function handleAddManualOrder(row: AssetUniverseViewV1, side: "BUY" | "SELL") {
    if (!bootstrap || busy) return;
    if (side === "SELL" && row.holdingQty <= 0) {
      toast.error(`${row.symbol} 无可卖持仓`);
      return;
    }
    setOrderDraft({ row, side });
  }

  async function handlePreviewOrder(input: { assetKey: string; side: "BUY" | "SELL"; qty?: number; notional?: number }) {
    return previewWorkbenchExecutionV1(input);
  }

  async function handleSubmitManualOrder(preview: WorkbenchMarketOrderPreviewResultV1) {
    if (busy || orderSubmitting) return;
    setOrderSubmitting(true);
    setBusy(true);
    try {
      const result = await executeWorkbenchOrderV1({
        source: "manual",
        origin: "manual",
        side: preview.side,
        assetKey: preview.assetKey,
        symbol: preview.symbol,
        market: preview.market,
        currency: preview.currency,
        qty: preview.qty,
        price: preview.price,
        fee: preview.fee,
        pricingMode: "market",
        priceSource: preview.priceSource,
        priceSnapshotAt: preview.priceSnapshotAt,
        reasonText: "来自工作台市价预览",
      });
      if (result.result.status === "executed") toast.success(`${preview.symbol} 执行成功`);
      else toast.error(result.result.rejectMessage || `${preview.symbol} 执行失败`);
      await loadBootstrap(true);
      setOrderDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "执行失败");
    } finally {
      setOrderSubmitting(false);
      setBusy(false);
    }
  }

  async function handleSearchAssets(input: {
    q: string;
    market: string;
    assetClass: string;
    region: string;
  }): Promise<WorkbenchSearchAssetResultV1[]> {
    return searchWorkbenchAssetsV1({
      q: input.q,
      market: input.market,
      assetClass: input.assetClass,
      region: input.region,
      limit: 15,
    });
  }

  async function handleListFeaturedAssets(input: {
    market: string;
    assetClass: string;
    limitPerMarket?: number;
  }): Promise<WorkbenchFeaturedAssetsResultV1> {
    return listWorkbenchFeaturedAssetsV1({
      market: input.market,
      assetClass: input.assetClass,
      limitPerMarket: input.limitPerMarket,
    });
  }

  async function handleAddDiscoveredAsset(item: WorkbenchSearchAssetResultV1) {
    await upsertWorkbenchAssetV1({
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
    setActiveTab("watchlist");
    toast.success(`${item.name || item.symbol} 已加入观察列表`);
    await loadBootstrap(true);
  }

  async function handleToggleInlineInsights(row: AssetUniverseViewV1) {
    const assetKey = row.assetKey;
    const opened = Boolean(expandedInsightKeys[assetKey]);
    setExpandedInsightKeys((prev) => ({ ...prev, [assetKey]: !opened }));
    if (opened) return;
    if (insightDataByAssetKey[assetKey] || insightLoadingByAssetKey[assetKey]) return;

    setInsightLoadingByAssetKey((prev) => ({ ...prev, [assetKey]: true }));
    setInsightErrorByAssetKey((prev) => ({ ...prev, [assetKey]: "" }));
    try {
      const data = await getWorkbenchAssetInsightsV1(assetKey, {
        analysisFocus: bootstrap?.rebalanceStrategy.analysisFocus,
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
  }

  async function handleRemoveFromWatchlist(row: AssetUniverseViewV1) {
    if (assetActioningKey) return;
    setAssetActioningKey(row.assetKey);
    try {
      await patchWorkbenchAssetV1(row.assetKey, { watchEnabled: false, targetWeightHint: 0 });
      setExpandedInsightKeys((prev) => ({ ...prev, [row.assetKey]: false }));
      toast.success(`${row.symbol} 已移出观察列表`);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移除观察失败");
    } finally {
      setAssetActioningKey(null);
    }
  }

  async function handleToggleBasket(row: AssetUniverseViewV1, nextInBasket: boolean) {
    if (assetActioningKey) return;
    setAssetActioningKey(row.assetKey);
    try {
      await patchWorkbenchAssetV1(row.assetKey, {
        watchEnabled: true,
        targetWeightHint: nextInBasket ? (row.targetWeightHint > 0 ? row.targetWeightHint : 0.05) : 0,
      });
      toast.success(nextInBasket ? `${row.symbol} 已加入再平衡列表` : `${row.symbol} 已移出再平衡列表`);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新再平衡列表失败");
    } finally {
      setAssetActioningKey(null);
    }
  }

  function handleOpenCalibration(row: AssetUniverseViewV1) {
    const defaultPrice = row.holdingPrice > 0 ? row.holdingPrice : (row.lastPrice > 0 ? row.lastPrice : 0);
    const defaultCostBasis = row.costBasis ?? (row.holdingQty > 0 && defaultPrice > 0 ? row.holdingQty * defaultPrice : 0);
    setCalibrationDraft({
      row,
      qty: row.holdingQty > 0 ? row.holdingQty.toFixed(6) : "0",
      holdingPrice: defaultPrice > 0 ? defaultPrice.toFixed(4) : "0",
      costBasis: defaultCostBasis > 0 ? defaultCostBasis.toFixed(2) : "",
    });
  }

  async function handleSubmitCalibration() {
    if (!calibrationDraft || calibrating || busy) return;
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
      await patchWorkbenchAssetV1(calibrationDraft.row.assetKey, {
        holdingQty: qty,
        holdingPrice,
        costBasis,
        lastPrice: holdingPrice > 0 ? holdingPrice : undefined,
      });
      toast.success(`${calibrationDraft.row.symbol} 持仓已校准`);
      setCalibrationDraft(null);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "校准失败");
    } finally {
      setCalibrating(false);
    }
  }

  async function handleUpdateTargetWeight(row: AssetUniverseViewV1, targetWeightPct: number) {
    if (!Number.isFinite(targetWeightPct) || targetWeightPct < 0) {
      toast.error("目标权重必须是大于等于 0 的数字");
      return;
    }
    setTargetUpdating(true);
    try {
      await patchWorkbenchAssetV1(row.assetKey, {
        targetWeightHint: targetWeightPct / 100,
        watchEnabled: true,
      });
      toast.success(`${row.symbol} 目标权重已更新为 ${targetWeightPct.toFixed(2)}%`);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "目标权重更新失败");
    } finally {
      setTargetUpdating(false);
    }
  }

  async function handleNormalizeTargetWeights() {
    const watchRows = assetRows.filter((row) => row.watchEnabled);
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
      await Promise.all(watchRows.map((row, index) => patchWorkbenchAssetV1(row.assetKey, {
        watchEnabled: true,
        targetWeightHint: normalized[index],
      })));
      toast.success(`已归一化 ${watchRows.length} 个观察资产`);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "归一化失败");
    } finally {
      setTargetUpdating(false);
    }
  }

  async function handleGenerateCycle() {
    if (busy) return;
    setBusy(true);
    try {
      const generated = await generateWorkbenchRebalanceCycleV1({
        triggerSource: "manual",
        manual: true,
      });
      if (!generated.created) {
        toast.message(generated.message);
      } else {
        toast.success(generated.message);
      }
      if (generated.cycle) {
        setCurrentCycle(generated.cycle);
        setRiskCheck(generated.cycle.riskCheck);
      }
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成再平衡周期失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleProposal(symbol: string, selected: boolean) {
    if (!currentCycle || busy) return;
    setBusy(true);
    try {
      const selectedSymbols = currentCycle.proposals
        .map((row) => (row.symbol === symbol ? { ...row, selected } : row))
        .filter((row) => row.selected)
        .map((row) => row.symbol);
      const next = await patchWorkbenchRebalanceCycleV1(currentCycle.cycleId, { selectedSymbols });
      setCurrentCycle(next);
      const nextRisk = await runWorkbenchRiskCheckV1({
        cycleId: next.cycleId,
        selectedSymbols: next.proposals.filter((row) => row.selected).map((row) => row.symbol),
      });
      setRiskCheck(nextRisk);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新建议选择失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkReviewing() {
    if (!currentCycle || busy) return;
    setBusy(true);
    try {
      const next = await patchWorkbenchRebalanceCycleV1(currentCycle.cycleId, { status: "reviewing" });
      setCurrentCycle(next);
      toast.success("已标记为审阅中");
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新状态失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelCycle() {
    if (!currentCycle || busy) return;
    setBusy(true);
    try {
      const next = await patchWorkbenchRebalanceCycleV1(currentCycle.cycleId, {
        cancel: { reason: "用户在工作台取消" },
      });
      setCurrentCycle(next);
      toast.success("已取消本次再平衡");
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "取消失败");
    } finally {
      setBusy(false);
    }
  }

  async function executeCycleNow(mode: "selected" | "all") {
    if (!currentCycle || busy) return;
    setBusy(true);
    try {
      const selectedSymbols = currentCycle.proposals
        .filter((row) => mode === "all" || row.selected)
        .map((row) => row.symbol);
      const latestRisk = await runWorkbenchRiskCheckV1({ cycleId: currentCycle.cycleId, selectedSymbols });
      setRiskCheck(latestRisk);
      if (latestRisk.overallStatus === "block") {
        toast.error("风控阻断，无法执行。请先调整目标权重或建议选项。");
        return;
      }
      const result = await executeWorkbenchRebalanceCycleV1({
        cycleId: currentCycle.cycleId,
        executeMode: mode,
      });
      setCurrentCycle(result.cycle);
      toast.success(`执行完成：${result.cycle.executionSummary?.ordersExecuted || 0} 笔成功`);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "执行失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmExecuteCycle() {
    if (!pendingExecuteMode) return;
    const mode = pendingExecuteMode;
    setPendingExecuteMode(null);
    await executeCycleNow(mode);
  }

  const totalEquity = bootstrap?.account.totalEquity ?? 0;
  const holdingsValue = bootstrap
    ? assetRows.filter((r) => r.holdingQty > 0).reduce((sum, r) => sum + (r.valuationBase ?? 0), 0)
    : 0;
  const cashValue = bootstrap?.account.cash ?? 0;

  const sharedTableProps = {
    rows: assetRows,
    baseCurrency: bootstrap?.baseCurrency ?? "USD",
    counts: {
      all: assetRows.filter((row) => row.watchEnabled || row.holdingQty > 0).length,
      holdings: assetRows.filter((row) => row.holdingQty > 0).length,
      watchlist: assetRows.filter((row) => row.watchEnabled).length,
      basket: assetRows.filter((row) => row.watchEnabled && row.targetWeightHint > 0).length,
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
    actioningAssetKey: assetActioningKey,
    disabled: loading || busy || Boolean(assetActioningKey),
    updatingTarget: targetUpdating,
  };

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>工作台加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {bootstrap?.warnings?.length ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>风险提示</AlertTitle>
          <AlertDescription>{bootstrap.warnings.join("；")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span>总权益 <strong className="text-foreground">{formatCurrency(totalEquity, bootstrap?.baseCurrency || "USD")}</strong></span>
          <span>持仓 <strong className="text-foreground">{formatCurrency(holdingsValue, bootstrap?.baseCurrency || "USD")}</strong></span>
          <span>现金 <strong className="text-foreground">{formatCurrency(cashValue, bootstrap?.baseCurrency || "USD")}</strong></span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadBootstrap(true)} disabled={loading || refreshing}>
          <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "刷新中..." : "刷新"}
        </Button>
      </div>

      {loading && !bootstrap ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">加载工作台中...</div>
      ) : null}

      {bootstrap ? (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as WorkbenchTab)} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="positions" className="gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              <span>持仓</span>
              <span className="ml-0.5 text-xs text-muted-foreground">({summary.holdingAssets})</span>
            </TabsTrigger>
            <TabsTrigger value="watchlist" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              <span>观察列表</span>
              <span className="ml-0.5 text-xs text-muted-foreground">({summary.watchlistAssets})</span>
            </TabsTrigger>
            <TabsTrigger value="discovery" className="gap-1.5">
              <Compass className="h-3.5 w-3.5" />
              <span>资产发现</span>
            </TabsTrigger>
            <TabsTrigger value="rebalance" className="gap-1.5">
              <Scale className="h-3.5 w-3.5" />
              <span>再平衡</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="positions" className="min-w-0 space-y-4">
            <AssetUniverseTable {...sharedTableProps} view="holdings" />
          </TabsContent>

          <TabsContent value="watchlist" className="min-w-0 space-y-4">
            <AssetUniverseTable {...sharedTableProps} view="watchlist" />
          </TabsContent>

          <TabsContent value="discovery" className="min-w-0 space-y-4">
            <AssetDiscoveryPanel
              loading={loading || busy || targetUpdating}
              joinedAssetKeys={joinedAssetKeys}
              onListFeaturedAssets={handleListFeaturedAssets}
              onSearch={handleSearchAssets}
              onAddAsset={handleAddDiscoveredAsset}
            />
          </TabsContent>

          <TabsContent value="rebalance" className="space-y-4">
            <Card className="border-sky-200 bg-sky-50/60">
              <CardHeader>
                <CardTitle className="text-base">再平衡操作引导</CardTitle>
                <CardDescription>
                  你每次都需要手动确认后才会下单；定期/偏移自动触发只会生成建议，不会自动执行交易。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 md:grid-cols-3">
                  <div className={`rounded-md border px-3 py-2 text-sm ${currentCycle ? "border-emerald-200 bg-white" : "border-sky-200 bg-white"}`}>
                    <div className="text-xs text-muted-foreground">步骤 1</div>
                    <div className="font-medium">生成建议</div>
                    <div className="text-xs text-muted-foreground">先生成本次周期建议清单</div>
                  </div>
                  <div className={`rounded-md border px-3 py-2 text-sm ${currentCycle && currentCycle.status !== "generated" ? "border-emerald-200 bg-white" : "border-sky-200 bg-white"}`}>
                    <div className="text-xs text-muted-foreground">步骤 2</div>
                    <div className="font-medium">审阅与风控</div>
                    <div className="text-xs text-muted-foreground">勾选执行项，查看阻断/警告规则</div>
                  </div>
                  <div className={`rounded-md border px-3 py-2 text-sm ${currentCycle?.status === "completed" ? "border-emerald-200 bg-white" : "border-sky-200 bg-white"}`}>
                    <div className="text-xs text-muted-foreground">步骤 3</div>
                    <div className="font-medium">确认执行</div>
                    <div className="text-xs text-muted-foreground">弹窗二次确认后才会提交订单</div>
                  </div>
                </div>
                <div className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-sky-900">
                  点击“执行选中 / 执行全部”后，会先跑一次执行前风控；如果出现阻断项，系统会停止执行并提示原因。
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">策略状态</CardTitle>
                <CardDescription>
                  定期：{bootstrap.rebalanceStrategy.calendar.enabled ? "开启" : "关闭"} ·
                  偏移：{bootstrap.rebalanceStrategy.drift.enabled ? "开启" : "关闭"} ·
                  冷静期：{bootstrap.rebalanceStrategy.cooldownHours} 小时 ·
                  自动触发只生成建议，不自动执行
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={() => void handleGenerateCycle()} disabled={busy} className="bg-sky-600 hover:bg-sky-700">
                  1) 生成建议清单
                </Button>
                <Button variant="outline" onClick={() => void handleMarkReviewing()} disabled={busy || !currentCycle}>
                  2) 标记为审阅中
                </Button>
                <Button variant="outline" onClick={() => setPendingExecuteMode("selected")} disabled={busy || !currentCycle}>
                  3) 执行选中（需确认）
                </Button>
                <Button variant="outline" onClick={() => setPendingExecuteMode("all")} disabled={busy || !currentCycle}>
                  3) 执行全部（需确认）
                </Button>
                <Button variant="ghost" onClick={() => void handleCancelCycle()} disabled={busy || !currentCycle}>
                  取消本次再平衡
                </Button>
                <Button asChild variant="ghost" className="ml-auto">
                  <Link href="/daa/dashboard/trades">查看历史详情</Link>
                </Button>
              </CardContent>
            </Card>

            {currentCycle ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">当前周期</CardTitle>
                    <CardDescription>
                      周期 {currentCycle.cycleId.slice(0, 8)} · 状态 {cycleStatusLabel(currentCycle.status)} · 触发 {triggerSourceLabel(currentCycle.triggerSource)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{currentCycle.triggerReason}</div>
                    <div className="overflow-hidden rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>执行</TableHead>
                            <TableHead>标的代码</TableHead>
                            <TableHead>建议动作</TableHead>
                            <TableHead className="text-right">建议数量</TableHead>
                            <TableHead className="text-right">建议金额</TableHead>
                            <TableHead>建议说明</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentCycle.proposals.map((row) => (
                            <TableRow key={`${row.assetKey}-${row.side}`}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="daa-checkbox"
                                  checked={row.selected}
                                  onChange={(e) => void handleToggleProposal(row.symbol, e.target.checked)}
                                  disabled={busy}
                                />
                              </TableCell>
                              <TableCell>{row.symbol}</TableCell>
                              <TableCell className={row.side === "BUY" ? "text-emerald-600" : "text-amber-600"}>
                                {row.side === "BUY" ? "买入" : "卖出"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{row.suggestedQty.toFixed(4)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(row.suggestedNotional, bootstrap.baseCurrency)}</TableCell>
                              <TableCell>
                                <div className="text-sm">{row.reason}</div>
                                {row.hfContribution ? <div className="text-xs text-muted-foreground">人因贡献：{row.hfContribution}</div> : null}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">风控检查</CardTitle>
                    <CardDescription>
                      状态：{riskStatusLabel((riskCheck || currentCycle.riskCheck).overallStatus)}（生成建议和执行前都会检查）
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(riskCheck || currentCycle.riskCheck).items.map((item) => (
                      <div key={item.rule} className={`rounded-md border px-3 py-2 text-sm ${riskItemClassName(item.status)}`}>
                        <div className="font-medium">{riskRuleLabel(item.rule)} · {riskItemStatusLabel(item.status)}</div>
                        <div className="text-muted-foreground">{item.message}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          当前值 {item.current.toFixed(2)} · 阈值 {item.limit.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  尚无再平衡周期。请先点击“1) 生成建议清单”，再按步骤审阅和执行。
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">历史周期</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cycles.slice(0, 8).map((cycle) => (
                    <button
                      key={cycle.cycleId}
                      type="button"
                      className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setCurrentCycle(cycle);
                        setRiskCheck(cycle.riskCheck);
                      }}
                    >
                      <div className="font-medium">{cycle.cycleId.slice(0, 8)} · {triggerSourceLabel(cycle.triggerSource)} · {cycleStatusLabel(cycle.status)}</div>
                      <div className="text-xs text-muted-foreground">{new Date(cycle.createdAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : null}

      <MarketOrderDialog
        open={Boolean(orderDraft)}
        row={orderDraft?.row || null}
        side={orderDraft?.side || "BUY"}
        loading={orderSubmitting}
        onOpenChange={(next) => {
          if (!next) setOrderDraft(null);
        }}
        onPreview={handlePreviewOrder}
        onSubmit={handleSubmitManualOrder}
      />

      <Dialog
        open={Boolean(calibrationDraft)}
        onOpenChange={(open) => {
          if (!open) setCalibrationDraft(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>手动校准持仓</DialogTitle>
            <DialogDescription>
              用于修正手续费、分红或外部调仓导致的账面偏差。校准后会影响再平衡计算。
            </DialogDescription>
          </DialogHeader>
          {calibrationDraft ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                标的：{calibrationDraft.row.symbol} · {calibrationDraft.row.market}
              </div>
              <div className="space-y-1.5">
                <Label>持仓数量</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={calibrationDraft.qty}
                  onChange={(event) => setCalibrationDraft((prev) => prev ? { ...prev, qty: event.target.value } : prev)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>持仓均价（{calibrationDraft.row.currency}）</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={calibrationDraft.holdingPrice}
                  onChange={(event) => setCalibrationDraft((prev) => prev ? { ...prev, holdingPrice: event.target.value } : prev)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>总成本（{calibrationDraft.row.currency}，可留空自动计算）</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calibrationDraft.costBasis}
                  onChange={(event) => setCalibrationDraft((prev) => prev ? { ...prev, costBasis: event.target.value } : prev)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalibrationDraft(null)}>取消</Button>
            <Button onClick={() => void handleSubmitCalibration()} disabled={calibrating || busy}>
              {calibrating ? "保存中..." : "保存校准"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingExecuteMode)} onOpenChange={(open) => { if (!open) setPendingExecuteMode(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认执行再平衡</DialogTitle>
            <DialogDescription>系统仅会在你确认后下单执行，自动触发不会自动执行交易。</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <div>模式：{pendingExecuteMode === "all" ? "执行全部建议" : "仅执行勾选建议"}</div>
            <div>周期：{currentCycle ? currentCycle.cycleId.slice(0, 8) : "-"}</div>
            <div>订单数：{currentCycle ? currentCycle.proposals.filter((row) => pendingExecuteMode === "all" || row.selected).length : 0}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingExecuteMode(null)}>取消</Button>
            <Button onClick={() => void handleConfirmExecuteCycle()} disabled={busy}>确认执行</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
