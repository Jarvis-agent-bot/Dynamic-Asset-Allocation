"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlertCircle, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { ApiClientErrorV1, getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import {
  addWorkbenchExecutionItemV1,
  commitWorkbenchExecutionV1,
  getWorkbenchAssetInsightsV1,
  getWorkbenchBootstrapV1,
  getWorkbenchRecommendationsV1,
  previewWorkbenchExecutionV1,
  searchWorkbenchAssetsV1,
  upsertWorkbenchAssetV1,
} from "@/src/daa/modules/workbench/workbenchApiV1";
import type {
  AssetUniverseViewV1,
  WorkbenchAssetInsightResponseV1,
  WorkbenchBootstrapV1,
  WorkbenchMarketOrderPreviewResultV1,
  WorkbenchRecommendationsResultV1,
  WorkbenchSearchAssetResultV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";

import AssetDiscoveryPanel from "./AssetDiscoveryPanel";
import AssetInsightDialog from "./AssetInsightDialog";
import AssetUniverseTable, { type AssetUniverseViewFilterV1 } from "./AssetUniverseTable";
import ExecutionPanel from "./ExecutionPanel";
import MarketOrderDialog from "./MarketOrderDialog";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

function toPositive(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function normalizeView(value: string | undefined): AssetUniverseViewFilterV1 {
  if (value === "holdings") return "holdings";
  if (value === "candidates") return "candidates";
  return "all";
}

function toWorkbenchErrorMessage(error: unknown): string {
  if (error instanceof ApiClientErrorV1 && error.code === "DB_ERROR") {
    return "工作台数据服务暂时不可用，请稍后重试。";
  }
  return getApiErrorMessageV1(error);
}

export default function WorkbenchPageClient(props: {
  initialView?: string;
}) {
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [view, setView] = useState<AssetUniverseViewFilterV1>(() => normalizeView(props.initialView));
  const [analysisFocus, setAnalysisFocus] = useState("");
  const [recommendations, setRecommendations] = useState<WorkbenchRecommendationsResultV1 | null>(null);

  const [runningRecommendations, setRunningRecommendations] = useState(false);
  const [executionBusy, setExecutionBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [orderDraft, setOrderDraft] = useState<{ row: AssetUniverseViewV1; side: "BUY" | "SELL" } | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightData, setInsightData] = useState<WorkbenchAssetInsightResponseV1 | null>(null);
  const [insightSymbol, setInsightSymbol] = useState("");

  const loadBootstrap = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError("");
    try {
      const data = await getWorkbenchBootstrapV1();
      setBootstrap(data);
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
    if (bootstrap && !analysisFocus.trim()) {
      setAnalysisFocus("请基于当前仓位偏离与风险阈值给出可执行建议");
    }
  }, [bootstrap, analysisFocus]);

  useEffect(() => {
    function onRefresh() {
      void loadBootstrap(true);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, [loadBootstrap]);

  const queueItems = bootstrap?.execution.queueItems ?? [];
  const logs = bootstrap?.execution.logs ?? [];
  const assetRows = bootstrap?.assetUniverse ?? [];

  const summary = useMemo(() => {
    const totalAssets = assetRows.length;
    const holdingAssets = assetRows.filter((row) => row.holdingQty > 0).length;
    const candidateAssets = assetRows.filter((row) => row.watchEnabled).length;
    const missingPriceAssets = assetRows.filter((row) => row.priceStatus === "missing").length;
    return { totalAssets, holdingAssets, candidateAssets, missingPriceAssets };
  }, [assetRows]);

  async function handleAddManualOrder(row: AssetUniverseViewV1, side: "BUY" | "SELL") {
    if (!bootstrap || executionBusy) return;
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
    if (executionBusy || orderSubmitting) return;
    setOrderSubmitting(true);
    setExecutionBusy(true);
    try {
      const result = await addWorkbenchExecutionItemV1({
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
      toast.success(`${preview.symbol} 已加入执行队列（${result.queueItems.length} 条）`);
      await loadBootstrap(true);
      setOrderDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加入执行队列失败");
    } finally {
      setOrderSubmitting(false);
      setExecutionBusy(false);
    }
  }

  async function handleRunRecommendations() {
    if (runningRecommendations || !analysisFocus.trim()) return;
    setRunningRecommendations(true);
    try {
      const result = await getWorkbenchRecommendationsV1({ analysisFocus: analysisFocus.trim() });
      setRecommendations(result);
      toast.success(`建议生成完成：可执行 ${result.summary.executableOrderCount} 条`);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "建议生成失败");
    } finally {
      setRunningRecommendations(false);
    }
  }

  async function handleAddRecommendation(row: WorkbenchRecommendationsResultV1["recommendations"][number]) {
    if (executionBusy) return;
    const price = row.price > 0 ? row.price : 0;
    const qty = toPositive(row.suggestedQty, 0);
    if (!(price > 0) || !(qty > 0)) {
      toast.error(`${row.symbol} 建议缺少有效价格或数量，无法加入执行队列`);
      return;
    }

    setExecutionBusy(true);
    try {
      const result = await addWorkbenchExecutionItemV1({
        source: "decision",
        origin: "recommendation",
        side: row.side,
        assetKey: row.assetKey,
        symbol: row.symbol,
        market: row.market,
        currency: row.currency,
        qty,
        price,
        fee: 0,
        decisionRefId: row.decisionRefId,
        reasonTags: row.reasons,
        reasonText: `来自策略建议：${row.actionLabelZh}`,
      });
      toast.success(`${row.symbol} 已加入执行队列（${result.queueItems.length} 条）`);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加入执行队列失败");
    } finally {
      setExecutionBusy(false);
    }
  }

  async function handleAddAllRecommendations() {
    if (executionBusy) return;
    const rows = recommendations?.recommendations ?? [];
    if (!rows.length) return;

    setExecutionBusy(true);
    try {
      let successCount = 0;
      for (const row of rows) {
        const price = row.price > 0 ? row.price : 0;
        const qty = toPositive(row.suggestedQty, 0);
        if (!(price > 0) || !(qty > 0)) continue;

        await addWorkbenchExecutionItemV1({
          source: "decision",
          origin: "recommendation",
          side: row.side,
          assetKey: row.assetKey,
          symbol: row.symbol,
          market: row.market,
          currency: row.currency,
          qty,
          price,
          fee: 0,
          decisionRefId: row.decisionRefId,
          reasonTags: row.reasons,
          reasonText: `来自策略建议：${row.actionLabelZh}`,
        });
        successCount += 1;
      }

      if (successCount <= 0) {
        toast.error("没有可加入执行队列的有效建议（缺少价格或数量）");
      } else {
        toast.success(`已加入 ${successCount} 条建议到执行队列`);
      }
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量加入失败");
    } finally {
      setExecutionBusy(false);
    }
  }

  async function handleCommitExecution() {
    if (committing) return;
    setCommitting(true);
    try {
      const result = await commitWorkbenchExecutionV1();
      toast.success(`执行完成：成功 ${result.summary.executed} / 失败 ${result.summary.rejected}`);
      await loadBootstrap(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "执行失败");
    } finally {
      setCommitting(false);
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
    toast.success(`${item.symbol} 已加入资产宇宙`);
    await loadBootstrap(true);
  }

  async function handleOpenInsights(row: AssetUniverseViewV1) {
    setInsightOpen(true);
    setInsightLoading(true);
    setInsightSymbol(row.symbol);
    setInsightData(null);
    try {
      const data = await getWorkbenchAssetInsightsV1(row.assetKey, {
        analysisFocus: analysisFocus.trim(),
        includeLlm: true,
      });
      setInsightData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载资产洞察失败");
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>工作台加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="text-sm text-muted-foreground">
            资产 {summary.totalAssets} 个 · 持仓 {summary.holdingAssets} 个 · 候选 {summary.candidateAssets} 个 · 缺价 {summary.missingPriceAssets} 个 · 待执行 {queueItems.length} 条 · 现金 {formatCurrency(bootstrap?.account.cash ?? 0, bootstrap?.baseCurrency || "USD")}
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadBootstrap(true)} disabled={loading || refreshing}>
            <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "刷新中..." : "刷新"}
          </Button>
        </CardContent>
      </Card>

      {bootstrap?.warnings?.length ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>工作台风险提示</AlertTitle>
          <AlertDescription>{bootstrap.warnings.join("；")}</AlertDescription>
        </Alert>
      ) : null}

      {bootstrap ? (
        <div className="mx-auto w-full max-w-[1920px] overflow-x-hidden">
          <div className="grid items-start gap-4 min-[1280px]:grid-cols-[360px_minmax(0,1fr)] min-[1600px]:grid-cols-[360px_minmax(0,1fr)_420px]">
            <div className="min-w-0 min-[1600px]:max-h-[calc(100vh-8rem)] min-[1600px]:overflow-auto min-[1600px]:pr-1">
              <AssetDiscoveryPanel
                loading={loading || executionBusy}
                onSearch={handleSearchAssets}
                onAddAsset={handleAddDiscoveredAsset}
              />
            </div>

            <div className="relative z-20 min-w-0 min-[1600px]:max-h-[calc(100vh-8rem)] min-[1600px]:overflow-auto min-[1600px]:pr-1">
              <AssetUniverseTable
                rows={assetRows}
                baseCurrency={bootstrap.baseCurrency}
                view={view}
                onViewChange={setView}
                onAddToExecution={handleAddManualOrder}
                onOpenInsights={handleOpenInsights}
                disabled={loading || executionBusy}
              />
            </div>

            <div className="relative z-10 min-w-0 min-[1280px]:col-span-2 min-[1600px]:col-span-1 min-[1600px]:self-start min-[1600px]:sticky min-[1600px]:top-4">
              <ExecutionPanel
                baseCurrency={bootstrap.baseCurrency}
                analysisFocus={analysisFocus}
                onAnalysisFocusChange={setAnalysisFocus}
                onRunRecommendations={handleRunRecommendations}
                onAddRecommendation={handleAddRecommendation}
                onAddAllRecommendations={handleAddAllRecommendations}
                runningRecommendations={runningRecommendations}
                recommendations={recommendations}
                queueId={bootstrap.execution.queueId}
                queueItems={queueItems}
                logs={logs}
                committing={committing}
                disabled={executionBusy}
                onCommit={handleCommitExecution}
              />
            </div>
          </div>
        </div>
      ) : null}

      <AssetInsightDialog
        open={insightOpen}
        loading={insightLoading}
        symbol={insightSymbol}
        data={insightData}
        onOpenChange={setInsightOpen}
      />

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

      {loading ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">加载工作台中...</div>
      ) : null}
    </div>
  );
}
