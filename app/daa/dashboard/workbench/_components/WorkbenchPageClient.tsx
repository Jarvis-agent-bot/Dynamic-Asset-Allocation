"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Briefcase, CheckCircle2, CheckSquare2, Circle, Compass, Eye, MoreHorizontal, RefreshCcw, Scale, TriangleAlert, XSquare } from "lucide-react";
import { toast } from "sonner";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DeepLedgerActionButton,
  DeepLedgerDialogShell,
  DeepLedgerEmptyState,
  DeepLedgerNoticeBox,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  deepLedgerFieldClassName,
  deepLedgerMonoPanelClassName,
  deepLedgerSubtlePanelClassName,
  deepLedgerTableShellClassName,
  type DeepLedgerTone,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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
  summarizeWorkbenchRebalanceExecutionV1,
  submitWorkbenchLlmFeedbackV1,
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
  ExecuteRebalanceSummaryV1,
  WorkbenchFeaturedAssetsResultV1,
  WorkbenchMarketOrderPreviewResultV1,
  WorkbenchSearchAssetResultV1,
  WorkbenchLlmFeedbackScoreV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";

import AssetDiscoveryPanel from "../../portfolio/_components/workbench/AssetDiscoveryPanel";
import AssetUniverseTable from "../../portfolio/_components/workbench/AssetUniverseTable";
import MarketOrderDialog from "../../portfolio/_components/workbench/MarketOrderDialog";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

type WorkbenchTab = "positions" | "watchlist" | "discovery" | "rebalance";

function normalizeWorkbenchTabV1(input: string): WorkbenchTab {
  if (input === "positions" || input === "watchlist" || input === "discovery" || input === "rebalance") return input;
  return "positions";
}

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

function isTerminalCycleStatusV1(status: RebalanceCycleV1["status"]): boolean {
  return status === "completed" || status === "cancelled";
}

function isExecutableCycleStatusV1(status: RebalanceCycleV1["status"]): boolean {
  return status === "generated" || status === "reviewing";
}

function triggerSourceLabel(source: RebalanceCycleV1["triggerSource"]): string {
  if (source === "calendar") return "定期触发";
  if (source === "drift") return "偏移触发";
  if (source === "risk") return "止盈止损触发";
  if (source === "cash_idle") return "现金闲置触发";
  return "手动触发";
}

function marketRegimeLabel(regime: string | null | undefined): string {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
}

function marketPercentileText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "近一年位置 N/A";
  return `近一年位置 ${value.toFixed(1)}%`;
}

function marketRegimeTone(regime: string | null | undefined): DeepLedgerTone {
  if (regime === "risk_off") return "amber";
  if (regime === "risk_on") return "green";
  if (regime === "transitional") return "indigo";
  return "slate";
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

function riskItemTone(status: "pass" | "warn" | "block"): DeepLedgerTone {
  if (status === "block") return "red";
  if (status === "warn") return "amber";
  return "green";
}

function riskOverallTone(status: PreTradeRiskCheckV1["overallStatus"]): DeepLedgerTone {
  if (status === "block") return "red";
  if (status === "warn") return "amber";
  return "green";
}

function cycleStatusTone(status: RebalanceCycleV1["status"]): DeepLedgerTone {
  if (status === "completed") return "green";
  if (status === "executing") return "indigo";
  if (status === "cancelled") return "slate";
  if (status === "reviewing") return "amber";
  return "cyan";
}

type ExecutionReceiptV1 = {
  cycleId: string;
  mode: "selected" | "all";
  status: "success" | "partial" | "failed" | "blocked";
  executed: number;
  failed: number;
  summary: string;
  reason?: string;
  ts: string;
};

function executionReceiptMeta(status: ExecutionReceiptV1["status"]): {
  title: string;
  tone: DeepLedgerTone;
} {
  if (status === "success") return { title: "执行成功", tone: "green" };
  if (status === "partial") return { title: "部分执行成功", tone: "amber" };
  if (status === "blocked") return { title: "执行被风控阻断", tone: "red" };
  return { title: "执行失败", tone: "red" };
}

export default function WorkbenchPageClient(props: {
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(() => {
    return normalizeWorkbenchTabV1(String(props.initialTab || ""));
  });

  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [cycles, setCycles] = useState<RebalanceCycleV1[]>([]);
  const [currentCycle, setCurrentCycle] = useState<RebalanceCycleV1 | null>(null);
  const [riskCheck, setRiskCheck] = useState<PreTradeRiskCheckV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
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
  const [executeSummary, setExecuteSummary] = useState<ExecuteRebalanceSummaryV1 | null>(null);
  const [executeSummaryLoading, setExecuteSummaryLoading] = useState(false);
  const [executeSummaryError, setExecuteSummaryError] = useState("");
  const [llmFeedbackSubmittingByContext, setLlmFeedbackSubmittingByContext] = useState<Record<string, boolean>>({});
  const [llmFeedbackScoreByContext, setLlmFeedbackScoreByContext] = useState<Record<string, WorkbenchLlmFeedbackScoreV1>>({});
  const [executionReceipt, setExecutionReceipt] = useState<ExecutionReceiptV1 | null>(null);
  const [calibrationDraft, setCalibrationDraft] = useState<{
    row: AssetUniverseViewV1;
    qty: string;
    holdingPrice: string;
    costBasis: string;
  } | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [marketContextExpanded, setMarketContextExpanded] = useState(false);
  const [expandedProposalDecisionKeys, setExpandedProposalDecisionKeys] = useState<Record<string, boolean>>({});
  const currentCycleIdRef = useRef<string | null>(null);
  const insightPrefetchedRef = useRef<Record<string, true>>({});

  useEffect(() => {
    currentCycleIdRef.current = currentCycle?.cycleId || null;
  }, [currentCycle?.cycleId]);

  const loadBootstrap = useCallback(async (silent = false, preferredCycleId?: string | null) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    setAuthRequired(false);
    try {
      const [nextBootstrap, nextCycles] = await Promise.all([
        getWorkbenchBootstrapV1(),
        listWorkbenchRebalanceCyclesV1(40),
      ]);
      setBootstrap(nextBootstrap);
      setCycles(nextCycles);
      const latestCycle = nextCycles[0] || nextBootstrap.latestCycle || null;
      const preferredId = preferredCycleId || currentCycleIdRef.current;
      const preferredCycle = preferredId
        ? nextCycles.find((item) => item.cycleId === preferredId) || null
        : null;
      const nextCurrentCycle = preferredCycle || latestCycle;
      setCurrentCycle(nextCurrentCycle);
      setRiskCheck(nextCurrentCycle?.riskCheck || null);
    } catch (err) {
      const message = toWorkbenchErrorMessage(err);
      setError(message);
      setAuthRequired(/unauthorized/i.test(message));
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

  useEffect(() => {
    if (!bootstrap) return;
    const seeds = (bootstrap.assetUniverse || [])
      .filter((row) => row.holdingQty > 0 || row.watchEnabled)
      .slice(0, 8);
    for (const row of seeds) {
      if (insightPrefetchedRef.current[row.assetKey]) continue;
      insightPrefetchedRef.current[row.assetKey] = true;
      setInsightLoadingByAssetKey((prev) => ({ ...prev, [row.assetKey]: true }));
      void getWorkbenchAssetInsightsV1(row.assetKey, {
        analysisFocus: bootstrap.rebalanceStrategy.analysisFocus,
        includeLlm: false,
      }).then((data) => {
        setInsightDataByAssetKey((prev) => ({ ...prev, [row.assetKey]: data }));
      }).catch(() => {
        // ignore prefetch error
      }).finally(() => {
        setInsightLoadingByAssetKey((prev) => ({ ...prev, [row.assetKey]: false }));
      });
    }
  }, [bootstrap]);

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
        notionalInBase: preview.notionalInBase,
        fee: preview.fee,
        pricingMode: "market",
        priceSource: preview.priceSource,
        priceSnapshotAt: preview.priceSnapshotAt ?? undefined,
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
    toast.success(`${item.name || item.symbol} 已加入观察列表`, {
      action: {
        label: "查看观察列表",
        onClick: () => setActiveTab("watchlist"),
      },
    });
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

  async function handleSubmitLlmFeedback(input: {
    contextId: string;
    type: "insight" | "decision";
    score: WorkbenchLlmFeedbackScoreV1;
  }) {
    if (!input.contextId) return;
    if (llmFeedbackSubmittingByContext[input.contextId]) return;
    setLlmFeedbackSubmittingByContext((prev) => ({ ...prev, [input.contextId]: true }));
    try {
      await submitWorkbenchLlmFeedbackV1({
        contextId: input.contextId,
        type: input.type,
        score: input.score,
      });
      setLlmFeedbackScoreByContext((prev) => ({ ...prev, [input.contextId]: input.score }));
      toast.success("已记录反馈");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "反馈提交失败");
    } finally {
      setLlmFeedbackSubmittingByContext((prev) => ({ ...prev, [input.contextId]: false }));
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
        currentCycleIdRef.current = generated.cycle.cycleId;
      }
      await loadBootstrap(true, generated.cycle?.cycleId || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成再平衡周期失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleProposal(symbol: string, side: "BUY" | "SELL", selected: boolean) {
    if (!currentCycle || busy) return;
    if (isTerminalCycleStatusV1(currentCycle.status)) {
      toast.error("该周期已终态，请生成新周期继续调仓。");
      return;
    }
    setBusy(true);
    try {
      const selectedSymbols = currentCycle.proposals
        .map((row) => (row.symbol === symbol && row.side === side ? { ...row, selected } : row))
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

  async function handleSelectAllProposals(selected: boolean) {
    if (!currentCycle || busy) return;
    if (isTerminalCycleStatusV1(currentCycle.status)) {
      toast.error("该周期已终态，请生成新周期继续调仓。");
      return;
    }
    setBusy(true);
    try {
      const selectedSymbols = selected ? currentCycle.proposals.map((row) => row.symbol) : [];
      const next = await patchWorkbenchRebalanceCycleV1(currentCycle.cycleId, { selectedSymbols });
      setCurrentCycle(next);
      const nextRisk = await runWorkbenchRiskCheckV1({
        cycleId: next.cycleId,
        selectedSymbols: next.proposals.filter((row) => row.selected).map((row) => row.symbol),
      });
      setRiskCheck(nextRisk);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量更新建议选择失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelCycle() {
    if (!currentCycle || busy) return;
    if (isTerminalCycleStatusV1(currentCycle.status)) {
      toast.error("该周期已终态，无需重复取消。");
      return;
    }
    setBusy(true);
    try {
      const next = await patchWorkbenchRebalanceCycleV1(currentCycle.cycleId, {
        cancel: { reason: "用户在工作台取消" },
      });
      setCurrentCycle(next);
      setRiskCheck(next.riskCheck || null);
      currentCycleIdRef.current = next.cycleId;
      toast.success("已取消本次再平衡");
      await loadBootstrap(true, next.cycleId);
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
        setExecutionReceipt({
          cycleId: currentCycle.cycleId,
          mode,
          status: "blocked",
          executed: 0,
          failed: 0,
          summary: "执行前风控阻断，订单未提交。",
          reason: "请先调整目标权重或建议勾选后重试。",
          ts: new Date().toISOString(),
        });
        toast.error("风控阻断，无法执行。请先调整目标权重或建议选项。");
        return;
      }
      const result = await executeWorkbenchRebalanceCycleV1({
        cycleId: currentCycle.cycleId,
        executeMode: mode,
      });
      setCurrentCycle(result.cycle);
      setCycles((prev) => [result.cycle, ...prev.filter((item) => item.cycleId !== result.cycle.cycleId)]);
      setRiskCheck(result.cycle.riskCheck || null);
      currentCycleIdRef.current = result.cycle.cycleId;
      const executed = result.cycle.executionSummary?.ordersExecuted || 0;
      const failed = result.cycle.executionSummary?.ordersFailed || 0;
      if (executed > 0 && failed <= 0) {
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "success",
          executed,
          failed,
          summary: `执行完成：${executed} 笔成功。`,
          ts: new Date().toISOString(),
        });
        toast.success(`执行完成：${executed} 笔成功`);
      } else if (executed > 0 && failed > 0) {
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "partial",
          executed,
          failed,
          summary: `部分执行成功：成功 ${executed} 笔，失败 ${failed} 笔。`,
          ts: new Date().toISOString(),
        });
        toast.message(`部分执行成功：成功 ${executed} 笔，失败 ${failed} 笔`);
      } else {
        const ticketSet = new Set(result.cycle.executedOrders || []);
        const rejected = result.logs.filter((row) => ticketSet.has(row.ticketId) && row.status === "rejected");
        const reason = rejected[0]?.rejectMessage || rejected[0]?.rejectCode || "订单被执行层拒绝";
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "failed",
          executed: 0,
          failed: failed || rejected.length || 0,
          summary: `执行失败：${failed || rejected.length || 0} 笔被拒绝。`,
          reason,
          ts: new Date().toISOString(),
        });
        toast.error(`执行失败：${failed || rejected.length || 0} 笔被拒绝。${reason}`);
      }
      await loadBootstrap(true, result.cycle.cycleId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "执行失败";
      setExecutionReceipt({
        cycleId: currentCycle.cycleId,
        mode,
        status: "failed",
        executed: 0,
        failed: 0,
        summary: "执行请求失败，未完成下单。",
        reason: message,
        ts: new Date().toISOString(),
      });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmExecuteCycle() {
    if (!pendingExecuteMode) return;
    const mode = pendingExecuteMode;
    setPendingExecuteMode(null);
    setExecuteSummary(null);
    await executeCycleNow(mode);
  }

  function handleOpenExecuteDialog(mode: "selected" | "all") {
    if (!currentCycle || busy) return;
    if (!isExecutableCycleStatusV1(currentCycle.status)) {
      toast.error("该周期不可执行，请生成新周期继续调仓。");
      return;
    }
    if (currentRiskCheck?.overallStatus === "block") {
      toast.error("当前风控校验存在阻断项，请先处理风险提示后再执行。");
      return;
    }
    if (mode === "selected" && currentCycle.proposals.filter((row) => row.selected).length <= 0) {
      toast.error("请至少勾选一条建议后再执行");
      return;
    }
    setPendingExecuteMode(mode);
  }

  useEffect(() => {
    if (!pendingExecuteMode || !currentCycle) {
      setExecuteSummary(null);
      setExecuteSummaryLoading(false);
      setExecuteSummaryError("");
      return;
    }
    let alive = true;
    setExecuteSummaryLoading(true);
    setExecuteSummaryError("");
    void summarizeWorkbenchRebalanceExecutionV1({
      cycleId: currentCycle.cycleId,
      executeMode: pendingExecuteMode,
    }).then((summary) => {
      if (!alive) return;
      setExecuteSummary(summary);
    }).catch((error) => {
      if (!alive) return;
      setExecuteSummary(null);
      setExecuteSummaryError(error instanceof Error ? error.message : "执行摘要生成失败，请重试后再执行。");
    }).finally(() => {
      if (!alive) return;
      setExecuteSummaryLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pendingExecuteMode, currentCycle]);

  const totalEquity = bootstrap?.account.totalEquity ?? 0;
  const holdingsValue = bootstrap
    ? assetRows.filter((r) => r.holdingQty > 0).reduce((sum, r) => sum + (r.valuationBase ?? 0), 0)
    : 0;
  const cashValue = bootstrap?.account.cash ?? 0;
  const currentRiskCheck = riskCheck || currentCycle?.riskCheck || null;
  const selectedProposalCount = currentCycle?.proposals.filter((row) => row.selected).length ?? 0;
  const isCurrentCycleTerminal = Boolean(currentCycle && isTerminalCycleStatusV1(currentCycle.status));
  const riskReadyForExecution = Boolean(currentRiskCheck && currentRiskCheck.overallStatus !== "block");
  const canEditCurrentCycle = Boolean(currentCycle && !isCurrentCycleTerminal && !busy);
  const canExecuteAll = Boolean(currentCycle && isExecutableCycleStatusV1(currentCycle.status) && riskReadyForExecution && !busy);
  const canExecuteSelected = Boolean(currentCycle && isExecutableCycleStatusV1(currentCycle.status) && selectedProposalCount > 0 && riskReadyForExecution && !busy);
  const selectedProposalNotional = currentCycle?.proposals
    .filter((row) => row.selected)
    .reduce((sum, row) => sum + row.suggestedNotional, 0) ?? 0;
  const totalProposalNotional = currentCycle?.proposals.reduce((sum, row) => sum + row.suggestedNotional, 0) ?? 0;
  const buyProposalCount = currentCycle?.proposals.filter((row) => row.side === "BUY").length ?? 0;
  const sellProposalCount = currentCycle?.proposals.filter((row) => row.side === "SELL").length ?? 0;
  const activeMarketContext = currentCycle?.marketContext || bootstrap?.marketContext || null;
  const primaryDecisionContext = currentCycle?.proposals.find((row) => row.decisionContext)?.decisionContext || null;
  const scopedMarketContext = primaryDecisionContext?.marketScope
    ? activeMarketContext?.scopes?.find((item) => item.scope === primaryDecisionContext.marketScope) || null
    : null;
  const decisionMarketContext = scopedMarketContext || activeMarketContext;
  const decisionMarketLabel = primaryDecisionContext?.marketScopeLabel || scopedMarketContext?.label || "组合摘要";
  const currentDecisionReasons = decisionMarketContext?.reasons.slice(0, 3) || [];
  const currentDecisionFacts = decisionMarketContext?.indicators.slice(0, 3).map((item) => (
    `${item.label} ${item.rawValue == null ? "N/A" : `${item.rawValue}${item.unit || ""}`} / ${marketPercentileText(item.percentile252)}`
  )) || [];
  const basketAssetCount = assetRows.filter((row) => row.watchEnabled && row.targetWeightHint > 0).length;
  const hasCycleProposal = Boolean(currentCycle && currentCycle.proposals.length > 0);
  const rebalanceChecklist = [
    {
      id: "watchlist",
      label: "观察列表至少 1 个资产",
      ok: summary.watchlistAssets > 0,
      hint: "去资产发现添加候选资产",
    },
    {
      id: "basket",
      label: "再平衡列表至少 1 个目标权重 > 0 的资产",
      ok: basketAssetCount > 0,
      hint: "去观察列表设置目标权重",
    },
    {
      id: "cycle",
      label: "已生成建议周期",
      ok: Boolean(currentCycle),
      hint: "点击生成/刷新建议",
    },
    {
      id: "proposal",
      label: "建议列表中存在可审阅条目",
      ok: hasCycleProposal,
      hint: "先完成建议生成",
    },
    {
      id: "risk",
      label: "执行前风控非阻断",
      ok: riskReadyForExecution,
      hint: "查看风控检查并消除阻断项",
    },
  ];
  const rebalanceChecklistAllPassed = rebalanceChecklist.every((item) => item.ok);
  const firstUnmetChecklist = rebalanceChecklist.find((item) => !item.ok);
  const cycleProgressText = !currentCycle
    ? "尚未生成建议"
    : (currentCycle.status === "completed"
      ? "已执行完成"
      : (currentCycle.status === "cancelled"
        ? "周期已取消（只读）"
        : (currentCycle.status === "executing"
          ? "执行中，请等待结果"
          : (selectedProposalCount > 0 ? "建议已勾选，可执行" : "请先勾选建议"))));

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
    onSubmitLlmFeedback: handleSubmitLlmFeedback,
    llmFeedbackSubmittingByContext,
    llmFeedbackScoreByContext,
    actioningAssetKey: assetActioningKey,
    disabled: loading || busy || Boolean(assetActioningKey),
    updatingTarget: targetUpdating,
  };

  const actionLinkClassName = "inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--text)]";
  const tableHeadClassName = "border-b border-[var(--border)] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]";
  const tableCellClassName = "border-b border-[var(--border)] px-3 py-3 align-top text-sm";
  const tabInfo: Record<WorkbenchTab, { icon: React.ReactNode; label: string; count?: number; tone: DeepLedgerTone }> = {
    positions: { icon: <Briefcase className="h-3.5 w-3.5" />, label: "持仓", count: summary.holdingAssets, tone: "cyan" },
    watchlist: { icon: <Eye className="h-3.5 w-3.5" />, label: "观察列表", count: summary.watchlistAssets, tone: "amber" },
    discovery: { icon: <Compass className="h-3.5 w-3.5" />, label: "资产发现", tone: "indigo" },
    rebalance: { icon: <Scale className="h-3.5 w-3.5" />, label: "再平衡", tone: "green" },
  };

  return (
    <div className="space-y-4">
      {error ? (
        <DeepLedgerNoticeBox
          tone="red"
          title="工作台加载失败"
          icon={<AlertCircle className="h-4 w-4" />}
          description={authRequired ? "当前会话未登录或已失效，请重新登录后再访问工作台。" : error}
          action={authRequired ? (
            <Link href="/daa/login?returnTo=%2Fdaa%2Fdashboard%2Fworkbench" className="text-xs font-medium text-[var(--primary)] underline underline-offset-4">
              前往登录
            </Link>
          ) : null}
        />
      ) : null}

      {bootstrap?.marketDataHealth && bootstrap.marketDataHealth.status !== "ok" ? (
        <DeepLedgerNoticeBox
          tone={bootstrap.marketDataHealth.status === "down" ? "red" : "amber"}
          title={bootstrap.marketDataHealth.status === "down" ? "市场数据不可用" : "市场数据已降级"}
          icon={<AlertCircle className="h-4 w-4" />}
          description={bootstrap.marketDataHealth.message}
        >
          <div className="font-[var(--font-mono)] text-xs text-[var(--muted)]">
            fresh {bootstrap.marketDataHealth.freshCount} · stale {bootstrap.marketDataHealth.staleCount} · missing {bootstrap.marketDataHealth.missingCount} · 近 24h 失败率 {bootstrap.marketDataHealth.recentJobFailureRatePct.toFixed(1)}%
          </div>
        </DeepLedgerNoticeBox>
      ) : null}

      {bootstrap?.warnings?.length ? (
        <DeepLedgerNoticeBox
          tone="amber"
          title="风险提示"
          icon={<AlertCircle className="h-4 w-4" />}
          description={bootstrap.warnings.join("；")}
        />
      ) : null}

      {executionReceipt ? (() => {
        const meta = executionReceiptMeta(executionReceipt.status);
        return (
          <DeepLedgerNoticeBox
            tone={meta.tone}
            title={meta.title}
            description={`周期 ${executionReceipt.cycleId.slice(0, 8)} · 模式 ${executionReceipt.mode === "all" ? "执行全部" : "执行选中"} · ${new Date(executionReceipt.ts).toLocaleString()}`}
          >
            <div className="text-sm text-[var(--text)]">{executionReceipt.summary}</div>
            <div className="font-[var(--font-mono)] text-xs text-[var(--muted)]">成功 {executionReceipt.executed} 笔 · 失败 {executionReceipt.failed} 笔</div>
            {executionReceipt.reason ? (
              <div className="rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[rgba(8,12,20,0.28)] px-3 py-2 text-xs text-[var(--faint)]">
                详情：{executionReceipt.reason}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/daa/dashboard/trades" className={actionLinkClassName}>查看交易记录</Link>
              <DeepLedgerActionButton tone="slate" onClick={() => setExecutionReceipt(null)}>关闭回执</DeepLedgerActionButton>
            </div>
          </DeepLedgerNoticeBox>
        );
      })() : null}

      <div className="rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] px-5 py-4 shadow-[0_22px_48px_rgba(0,0,0,0.24)] sm:px-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "总权益", value: formatCurrency(totalEquity, bootstrap?.baseCurrency || "USD"), tone: "cyan" as const },
              { label: "持仓", value: formatCurrency(holdingsValue, bootstrap?.baseCurrency || "USD"), tone: "indigo" as const },
              { label: "现金", value: formatCurrency(cashValue, bootstrap?.baseCurrency || "USD"), tone: "green" as const },
            ].map((item) => (
              <div key={item.label} className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3") }>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{item.label}</div>
                <div className="mt-2 font-[var(--font-mono)] text-lg text-[var(--text)]">{item.value}</div>
                <div className="mt-2"><DeepLedgerStatusPill tone={item.tone}>账户快照</DeepLedgerStatusPill></div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <DeepLedgerStatusPill tone={refreshing ? "amber" : "green"}>{refreshing ? "同步中" : "数据已同步"}</DeepLedgerStatusPill>
            <DeepLedgerActionButton onClick={() => void loadBootstrap(true)} disabled={loading || refreshing}>
              <RefreshCcw className={cn("h-3.5 w-3.5", refreshing ? "animate-spin" : "")} />
              {refreshing ? "刷新中..." : "刷新"}
            </DeepLedgerActionButton>
          </div>
        </div>
      </div>

      {loading && !bootstrap ? (
        <DeepLedgerEmptyState title="加载工作台中..." description="正在同步账户、观察列表与再平衡周期，请稍候。" />
      ) : null}

      {bootstrap ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-[20px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-1.5 sm:grid-cols-4">
            {(["positions", "watchlist", "discovery", "rebalance"] as const).map((tab) => {
              const isActive = activeTab === tab;
              const info = tabInfo[tab];
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "border border-[var(--primary)]/30 bg-[rgba(56,189,248,0.12)] text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                      : "border border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
                  )}
                >
                  {info.icon}
                  <span>{info.label}</span>
                  {info.count !== undefined ? (
                    <span className={cn("font-[var(--font-mono)] text-[11px]", isActive ? "text-[var(--text)]" : "text-[var(--faint)]")}>
                      {info.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {activeTab === "positions" ? <AssetUniverseTable {...sharedTableProps} view="holdings" /> : null}
          {activeTab === "watchlist" ? <AssetUniverseTable {...sharedTableProps} view="watchlist" /> : null}
          {activeTab === "discovery" ? (
            <AssetDiscoveryPanel
              loading={loading || busy || targetUpdating}
              joinedAssetKeys={joinedAssetKeys}
              onListFeaturedAssets={handleListFeaturedAssets}
              onSearch={handleSearchAssets}
              onAddAsset={handleAddDiscoveredAsset}
            />
          ) : null}

          {activeTab === "rebalance" ? (
            <div className="space-y-4">
              {/* ── 首次调仓引导（无持仓时显示） ── */}
              {summary.holdingAssets <= 0 ? (
                <DeepLedgerPanel
                  accent="amber"
                  title="首次调仓引导（当前无持仓）"
                  subtitle="先完成资产加入与目标配置，再进入建议生成与执行。"
                  action={(
                    <div className="flex flex-wrap gap-2">
                      <DeepLedgerActionButton tone="primary" onClick={() => setActiveTab("discovery")}>去资产发现</DeepLedgerActionButton>
                      <DeepLedgerActionButton onClick={() => setActiveTab("watchlist")}>去观察列表设权重</DeepLedgerActionButton>
                    </div>
                  )}
                >
                  <DeepLedgerNoticeBox
                    tone="amber"
                    title="推荐路径"
                    description="资产发现添加标的 → 观察列表设置目标权重 → 生成建议 → 勾选并执行。"
                  />
                </DeepLedgerPanel>
              ) : null}

              {/* ── 操作栏：当前周期状态 + 主操作按钮 ── */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] px-5 py-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
                <div className="flex flex-wrap items-center gap-2">
                  {currentCycle ? (
                    <>
                      <span className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{currentCycle.cycleId.slice(0, 8)}</span>
                      <DeepLedgerStatusPill tone={cycleStatusTone(currentCycle.status)}>{cycleStatusLabel(currentCycle.status)}</DeepLedgerStatusPill>
                      <DeepLedgerStatusPill tone="slate">{triggerSourceLabel(currentCycle.triggerSource)}</DeepLedgerStatusPill>
                      <span className="hidden text-xs text-[var(--muted)] sm:inline">{cycleProgressText}</span>
                    </>
                  ) : (
                    <span className="text-sm text-[var(--muted)]">尚未生成再平衡建议，点击右侧按钮开始</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <DeepLedgerActionButton tone="primary" onClick={() => void handleGenerateCycle()} disabled={busy}>生成/刷新建议</DeepLedgerActionButton>
                  <DeepLedgerActionButton tone="success" onClick={() => handleOpenExecuteDialog("selected")} disabled={!canExecuteSelected}>
                    执行选中{selectedProposalCount > 0 ? ` (${selectedProposalCount})` : ""}
                  </DeepLedgerActionButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <DeepLedgerActionButton disabled={busy}>
                        <MoreHorizontal className="h-3.5 w-3.5" />
                        更多
                      </DeepLedgerActionButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                      <DropdownMenuItem onClick={() => handleOpenExecuteDialog("all")} disabled={!canExecuteAll}>执行全部（需确认）</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void handleCancelCycle()} disabled={!currentCycle || isCurrentCycleTerminal || busy}>取消本次再平衡</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild><Link href="/daa/dashboard/trades">查看历史详情</Link></DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* ── 主体两列布局 ── */}
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_296px] xl:items-start">

                {/* 左列：建议列表 + 市场快照 + 风控明细 */}
                <div className="flex min-w-0 flex-col gap-4">

                  {/* ① 建议列表（核心主内容） */}
                  <DeepLedgerPanel
                    accent={currentCycle ? cycleStatusTone(currentCycle.status) : "slate"}
                    title="本次建议"
                    subtitle={currentCycle
                      ? `周期 ${currentCycle.cycleId.slice(0, 8)} · 买入 ${buyProposalCount} · 卖出 ${sellProposalCount}`
                      : "点击「生成/刷新建议」获取调仓建议"}
                    action={(
                      <div className="flex flex-wrap gap-2">
                        {currentRiskCheck ? (
                          <DeepLedgerStatusPill tone={riskOverallTone(currentRiskCheck.overallStatus)}>
                            风控 {riskStatusLabel(currentRiskCheck.overallStatus)}
                          </DeepLedgerStatusPill>
                        ) : null}
                        {selectedProposalNotional > 0 ? (
                          <DeepLedgerStatusPill tone="cyan">
                            已选 {formatCurrency(selectedProposalNotional, bootstrap.baseCurrency)}
                          </DeepLedgerStatusPill>
                        ) : null}
                      </div>
                    )}
                  >
                    {currentCycle ? (
                      <div className="space-y-4">
                        {isCurrentCycleTerminal ? (
                          <DeepLedgerNoticeBox
                            tone="slate"
                            icon={<AlertCircle className="h-4 w-4" />}
                            title="当前周期已终态"
                            description="该周期只读；如需继续调仓，请生成新周期。"
                          />
                        ) : null}
                        {currentCycle.triggerSource === "risk" ? (
                          <DeepLedgerNoticeBox
                            tone="amber"
                            icon={<TriangleAlert className="h-4 w-4" />}
                            title="风险触发建议待处理"
                            description="该周期由止盈/止损阈值触发，请先看理由和风控，再决定是否执行。"
                          />
                        ) : null}

                        {currentCycle.proposals.length > 0 ? (
                          <>
                            <div className="flex flex-wrap gap-2">
                              <DeepLedgerActionButton tone="success" onClick={() => void handleSelectAllProposals(true)} disabled={!canEditCurrentCycle}>
                                <CheckSquare2 className="h-3.5 w-3.5" />
                                一键全选
                              </DeepLedgerActionButton>
                              <DeepLedgerActionButton tone="danger" onClick={() => void handleSelectAllProposals(false)} disabled={!canEditCurrentCycle}>
                                <XSquare className="h-3.5 w-3.5" />
                                清空勾选
                              </DeepLedgerActionButton>
                            </div>

                            <div className="space-y-3">
                              {currentCycle.proposals.map((row) => {
                                const proposalKey = `${row.assetKey}-${row.side}`;
                                const contextId = `decision:${currentCycle.cycleId}:${row.assetKey}:${row.side}`;
                                const decisionExpanded = Boolean(expandedProposalDecisionKeys[proposalKey]);
                                return (
                                  <div
                                    key={proposalKey}
                                    className={cn(
                                      "rounded-[18px] border p-4 transition-all",
                                      row.selected
                                        ? "border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.08)]"
                                        : "border-[var(--border)] bg-[rgba(8,12,20,0.48)]",
                                    )}
                                  >
                                    <div className="flex items-start gap-3">
                                      <input
                                        type="checkbox"
                                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                                        checked={row.selected}
                                        onChange={(e) => void handleToggleProposal(row.symbol, row.side, e.target.checked)}
                                        disabled={!canEditCurrentCycle}
                                      />
                                      <div className="min-w-0 flex-1 space-y-3">
                                        {/* 标识行 */}
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-[var(--font-mono)] text-[15px] font-semibold text-[var(--text)]">{row.symbol}</span>
                                          <DeepLedgerStatusPill tone={row.side === "BUY" ? "green" : "amber"}>{row.side === "BUY" ? "买入" : "卖出"}</DeepLedgerStatusPill>
                                          {row.currency !== bootstrap.baseCurrency ? <DeepLedgerStatusPill tone="slate">{row.currency}</DeepLedgerStatusPill> : null}
                                          <DeepLedgerStatusPill tone={row.selected ? "cyan" : "slate"}>{row.selected ? "已纳入执行" : "未勾选"}</DeepLedgerStatusPill>
                                        </div>

                                        {/* 数量 / 金额 / 价格 */}
                                        <div className="grid gap-2 sm:grid-cols-3">
                                          <div className={cn(deepLedgerSubtlePanelClassName, "px-3 py-2.5")}>
                                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">建议数量</div>
                                            <div className="mt-1.5 font-[var(--font-mono)] text-[15px] text-[var(--text)]">{row.suggestedQty.toFixed(4)}</div>
                                          </div>
                                          <div className={cn(deepLedgerSubtlePanelClassName, "px-3 py-2.5")}>
                                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">建议金额</div>
                                            <div className="mt-1.5 font-[var(--font-mono)] text-[15px] text-[var(--text)]">{formatCurrency(row.suggestedNotional, bootstrap.baseCurrency)}</div>
                                          </div>
                                          <div className={cn(deepLedgerSubtlePanelClassName, "px-3 py-2.5")}>
                                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">参考价格</div>
                                            <div className="mt-1.5 font-[var(--font-mono)] text-[15px] text-[var(--text)]">{formatCurrency(row.price, row.currency)}</div>
                                          </div>
                                        </div>

                                        {/* 可展开：执行说明 + 决策上下文 */}
                                        <button
                                          type="button"
                                          onClick={() => setExpandedProposalDecisionKeys((prev) => ({ ...prev, [proposalKey]: !prev[proposalKey] }))}
                                          className="flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                                        >
                                          <span className="text-[9px]">{decisionExpanded ? "▼" : "▶"}</span>
                                          执行说明与决策上下文
                                        </button>
                                        {decisionExpanded ? (
                                          <div className={cn(deepLedgerSubtlePanelClassName, "space-y-2.5 px-4 py-3.5")}>
                                            <div className="text-sm leading-6 text-[var(--text)]">{row.reason}</div>
                                            {row.hfContribution ? (
                                              <div className="text-xs text-[var(--muted)]">人因贡献：{row.hfContribution}</div>
                                            ) : null}
                                            {row.decisionContext ? (
                                              <div className="mt-3 space-y-1.5 border-t border-[rgba(255,255,255,0.06)] pt-3 font-[var(--font-mono)] text-xs text-[var(--faint)]">
                                                <div>信号：{row.decisionContext.signalAction || "—"} · 评分 {row.decisionContext.signalScore ?? "—"}</div>
                                                <div>LLM：{row.decisionContext.llmAdjustment || "—"} · 置信度 {row.decisionContext.llmConfidence ?? "—"}%</div>
                                                <div>市场环境：{marketRegimeLabel(row.decisionContext.effectiveMarketRegime)} · 执行倍数 {((row.decisionContext.finalQtyMultiplier ?? 1) * 100).toFixed(0)}%</div>
                                                {(row.decisionContext.conflictFlags ?? []).length > 0 ? (
                                                  <div className="text-amber-400/80">冲突：{row.decisionContext.conflictFlags.join(" / ")}</div>
                                                ) : null}
                                              </div>
                                            ) : null}
                                            <div className="flex flex-wrap gap-2 border-t border-[rgba(255,255,255,0.06)] pt-3">
                                              {(["up", "down"] as const).map((score) => {
                                                const isSelected = llmFeedbackScoreByContext[contextId] === score;
                                                const isSubmitting = Boolean(llmFeedbackSubmittingByContext[contextId]);
                                                return (
                                                  <DeepLedgerActionButton
                                                    key={score}
                                                    tone={isSelected ? (score === "up" ? "primary" : "danger") : "slate"}
                                                    disabled={isSubmitting}
                                                    onClick={() => void handleSubmitLlmFeedback({ contextId, type: "decision", score })}
                                                  >
                                                    {score === "up" ? "👍 有用" : "👎 无用"}
                                                  </DeepLedgerActionButton>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <DeepLedgerEmptyState title="当前周期没有生成建议" description="可以先调整观察列表目标权重，再重新生成建议。" />
                        )}
                      </div>
                    ) : (
                      <DeepLedgerEmptyState title="尚无再平衡周期" description="请先点击「生成/刷新建议」，再勾选建议并执行。" />
                    )}
                  </DeepLedgerPanel>

                  {/* ② 市场快照（默认折叠，避免信息过载） */}
                  {activeMarketContext ? (
                    <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)]">
                      <button
                        type="button"
                        onClick={() => setMarketContextExpanded((prev) => !prev)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--hover)]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--text)]">市场快照</span>
                          <DeepLedgerStatusPill tone={marketRegimeTone(primaryDecisionContext?.effectiveMarketRegime || activeMarketContext.regime)}>
                            {marketRegimeLabel(primaryDecisionContext?.effectiveMarketRegime || activeMarketContext.regime)}
                          </DeepLedgerStatusPill>
                          <span className="text-xs text-[var(--muted)]">
                            买入系数 {Math.round((decisionMarketContext?.buyScale ?? activeMarketContext.buyScale) * 100)}% · 高波动 {Math.round((decisionMarketContext?.highRiskBuyScale ?? activeMarketContext.highRiskBuyScale) * 100)}%
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] text-[var(--faint)]">{marketContextExpanded ? "▲ 收起" : "▼ 展开详情"}</span>
                      </button>

                      {marketContextExpanded ? (
                        <div className="space-y-4 border-t border-[var(--border)] px-5 pb-5 pt-4">
                          <div className="grid gap-3 md:grid-cols-3">
                            {[
                              { label: "规则层市场环境", regime: primaryDecisionContext?.ruleBasedMarketRegime || activeMarketContext.regime },
                              { label: "AI 市场环境", regime: primaryDecisionContext?.llmMarketRegime },
                              { label: "最终生效", regime: primaryDecisionContext?.effectiveMarketRegime || decisionMarketContext?.regime || activeMarketContext.regime },
                            ].map((item) => (
                              <div key={item.label} className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3.5")}>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{item.label}</div>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-[var(--text)]">{marketRegimeLabel(item.regime)}</div>
                                  <DeepLedgerStatusPill tone={marketRegimeTone(item.regime)}>{marketRegimeLabel(item.regime)}</DeepLedgerStatusPill>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3.5")}>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{decisionMarketLabel} · 买入系数</div>
                              <div className="mt-2 font-[var(--font-mono)] text-[18px] text-[var(--text)]">{decisionMarketContext ? Math.round(decisionMarketContext.buyScale * 100) : 0}%</div>
                              <div className="mt-1 text-xs text-[var(--muted)]">风险分 {decisionMarketContext?.riskOffScorePct.toFixed(1) || "0.0"} · 置信度 {decisionMarketContext?.confidencePct.toFixed(1) || "0.0"}%</div>
                            </div>
                            <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3.5")}>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">高波动执行系数</div>
                              <div className="mt-2 font-[var(--font-mono)] text-[18px] text-[var(--text)]">{decisionMarketContext ? Math.round(decisionMarketContext.highRiskBuyScale * 100) : 0}%</div>
                              <div className="mt-1 text-xs text-[var(--muted)]">适用于成长、加密与高波动资产</div>
                            </div>
                          </div>
                          {currentDecisionFacts.length > 0 ? (
                            <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3.5")}>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">关键市场指标</div>
                              <div className="mt-3 space-y-2 text-sm text-[var(--text)]">
                                {currentDecisionFacts.map((fact) => (
                                  <div key={fact} className="rounded-xl border border-[rgba(255,255,255,0.06)] px-3 py-2">{fact}</div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* ③ 风控明细（仅 warn / block 时展开显示） */}
                  {currentRiskCheck && currentRiskCheck.overallStatus !== "pass" ? (
                    <DeepLedgerPanel
                      accent={riskOverallTone(currentRiskCheck.overallStatus)}
                      title="风控提示"
                      subtitle={`状态：${riskStatusLabel(currentRiskCheck.overallStatus)}（告警可执行，阻断不可执行）`}
                      action={<DeepLedgerStatusPill tone={riskOverallTone(currentRiskCheck.overallStatus)}>{riskStatusLabel(currentRiskCheck.overallStatus)}</DeepLedgerStatusPill>}
                    >
                      <div className="grid gap-3 lg:grid-cols-2">
                        {currentRiskCheck.items.filter((item) => item.status !== "pass").map((item) => (
                          <div
                            key={item.rule}
                            className={cn(
                              "rounded-[16px] border px-4 py-3",
                              item.status === "block"
                                ? "border-rose-400/24 bg-rose-500/10"
                                : "border-amber-400/24 bg-amber-500/10",
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <DeepLedgerStatusPill tone={riskItemTone(item.status)}>{riskItemStatusLabel(item.status)}</DeepLedgerStatusPill>
                              <span className="text-sm font-semibold text-[var(--text)]">{riskRuleLabel(item.rule)}</span>
                            </div>
                            <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.message}</div>
                            <div className="mt-3 font-[var(--font-mono)] text-xs text-[var(--faint)]">当前值 {item.current.toFixed(2)} · 阈值 {item.limit.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </DeepLedgerPanel>
                  ) : null}
                </div>

                {/* 右列：执行确认 + 历史周期 */}
                <div className="flex min-w-0 flex-col gap-4">

                  {/* 执行操作卡 */}
                  <DeepLedgerPanel
                    accent={rebalanceChecklistAllPassed ? "green" : "amber"}
                    title="执行确认"
                    subtitle={rebalanceChecklistAllPassed ? "条件已满足，可以执行。" : `还差：${firstUnmetChecklist?.hint || "请按清单检查"}`}
                  >
                    <div className="space-y-3">
                      {/* 状态摘要 */}
                      <div className={cn(deepLedgerSubtlePanelClassName, "grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3.5 text-sm")}>
                        <div className="text-[var(--faint)]">已选建议</div>
                        <div className="text-right font-[var(--font-mono)] text-[var(--text)]">{selectedProposalCount} / {currentCycle?.proposals.length ?? 0}</div>
                        <div className="text-[var(--faint)]">预计成交</div>
                        <div className="text-right font-[var(--font-mono)] text-[var(--text)]">{formatCurrency(selectedProposalNotional, bootstrap?.baseCurrency || "USD")}</div>
                        <div className="text-[var(--faint)]">风控状态</div>
                        <div className="flex justify-end">
                          {currentRiskCheck
                            ? <DeepLedgerStatusPill tone={riskOverallTone(currentRiskCheck.overallStatus)}>{riskStatusLabel(currentRiskCheck.overallStatus)}</DeepLedgerStatusPill>
                            : <span className="text-xs text-[var(--faint)]">待勾选后检查</span>}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <DeepLedgerActionButton
                        tone="success"
                        className="w-full justify-center"
                        onClick={() => handleOpenExecuteDialog("selected")}
                        disabled={!canExecuteSelected}
                      >
                        执行选中{selectedProposalCount > 0 ? ` (${selectedProposalCount})` : ""}
                      </DeepLedgerActionButton>
                      <DeepLedgerActionButton
                        tone="primary"
                        className="w-full justify-center"
                        onClick={() => void handleGenerateCycle()}
                        disabled={busy}
                      >
                        {busy ? "处理中..." : "生成/刷新建议"}
                      </DeepLedgerActionButton>

                      {/* 执行条件清单 */}
                      <div className="border-t border-[var(--border)] pt-3">
                        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">执行条件</div>
                        <div className="space-y-2">
                          {rebalanceChecklist.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 text-xs">
                              {item.ok
                                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                : <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />}
                              <span className={item.ok ? "text-[var(--text)]" : "text-[var(--muted)]"}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </DeepLedgerPanel>

                  {/* 历史周期切换 */}
                  <DeepLedgerPanel accent="slate" title="历史周期" subtitle="最近 8 个">
                    <div className="space-y-2">
                      {cycles.slice(0, 8).map((cycle) => {
                        const active = cycle.cycleId === currentCycle?.cycleId;
                        return (
                          <button
                            key={cycle.cycleId}
                            type="button"
                            onClick={() => {
                              setCurrentCycle(cycle);
                              setRiskCheck(cycle.riskCheck);
                              currentCycleIdRef.current = cycle.cycleId;
                            }}
                            className={cn(
                              "w-full rounded-[14px] border px-4 py-3 text-left transition-all",
                              active
                                ? "border-[var(--primary)]/32 bg-[rgba(56,189,248,0.10)]"
                                : "border-[var(--border)] bg-[rgba(8,12,20,0.42)] hover:border-[var(--border-strong)] hover:bg-[var(--hover)]",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{cycle.cycleId.slice(0, 8)}</div>
                              <DeepLedgerStatusPill tone={cycleStatusTone(cycle.status)}>{cycleStatusLabel(cycle.status)}</DeepLedgerStatusPill>
                            </div>
                            <div className="mt-1.5 text-xs text-[var(--faint)]">{triggerSourceLabel(cycle.triggerSource)} · {new Date(cycle.createdAt).toLocaleString()}</div>
                          </button>
                        );
                      })}
                      {cycles.length === 0 ? (
                        <div className="py-4 text-center text-xs text-[var(--faint)]">暂无历史周期</div>
                      ) : null}
                    </div>
                    <div className="mt-3 border-t border-[var(--border)] pt-3">
                      <Link href="/daa/dashboard/trades" className="text-xs text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--text)]">
                        查看完整历史 →
                      </Link>
                    </div>
                  </DeepLedgerPanel>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <MarketOrderDialog
        open={Boolean(orderDraft)}
        row={orderDraft?.row || null}
        side={orderDraft?.side || "BUY"}
        loading={orderSubmitting}
        onOpenChange={(next) => { if (!next) setOrderDraft(null); }}
        onPreview={handlePreviewOrder}
        onSubmit={handleSubmitManualOrder}
      />

      <Dialog open={Boolean(calibrationDraft)} onOpenChange={(open) => { if (!open) setCalibrationDraft(null); }}>
        <DeepLedgerDialogShell
          accent="indigo"
          className="max-w-lg"
          title="手动校准持仓"
          description="用于修正手续费、分红或外部调仓导致的账面偏差。校准后会影响再平衡计算。"
          badges={<DeepLedgerStatusPill tone="indigo">Manual Calibration</DeepLedgerStatusPill>}
          footer={(
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DeepLedgerActionButton tone="slate" className="justify-center" onClick={() => setCalibrationDraft(null)}>取消</DeepLedgerActionButton>
              <DeepLedgerActionButton tone="primary" className="justify-center" onClick={() => void handleSubmitCalibration()} disabled={calibrating || busy}>
                {calibrating ? "保存中..." : "保存校准"}
              </DeepLedgerActionButton>
            </div>
          )}
        >
          {calibrationDraft ? (
            <div className="space-y-4">
              <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3 text-sm text-[var(--muted)]")}>
                标的：<span className="font-[var(--font-mono)] text-[var(--text)]">{calibrationDraft.row.symbol}</span> · {calibrationDraft.row.market}
              </div>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">持仓数量</span>
                <input type="number" min="0" step="0.000001" className={deepLedgerFieldClassName} value={calibrationDraft.qty} onChange={(e) => setCalibrationDraft((prev) => prev ? { ...prev, qty: e.target.value } : prev)} />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">持仓均价（{calibrationDraft.row.currency}）</span>
                <input type="number" min="0" step="0.0001" className={deepLedgerFieldClassName} value={calibrationDraft.holdingPrice} onChange={(e) => setCalibrationDraft((prev) => prev ? { ...prev, holdingPrice: e.target.value } : prev)} />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">总成本（{calibrationDraft.row.currency}，可留空自动计算）</span>
                <input type="number" min="0" step="0.01" className={deepLedgerFieldClassName} value={calibrationDraft.costBasis} onChange={(e) => setCalibrationDraft((prev) => prev ? { ...prev, costBasis: e.target.value } : prev)} />
              </label>
            </div>
          ) : null}
        </DeepLedgerDialogShell>
      </Dialog>

      <Dialog open={Boolean(pendingExecuteMode)} onOpenChange={(open) => { if (!open) setPendingExecuteMode(null); }}>
        <DeepLedgerDialogShell
          accent={executeSummary?.riskOverallStatus === "block" ? "red" : executeSummary?.riskOverallStatus === "warn" ? "amber" : "green"}
          className="max-w-lg"
          title="确认执行再平衡"
          description="系统仅会在你确认后下单执行，自动触发不会自动执行交易。"
          badges={<DeepLedgerStatusPill tone={pendingExecuteMode === "all" ? "amber" : "green"}>{pendingExecuteMode === "all" ? "执行全部" : "执行选中"}</DeepLedgerStatusPill>}
          footer={(
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DeepLedgerActionButton tone="slate" className="justify-center" onClick={() => setPendingExecuteMode(null)}>取消</DeepLedgerActionButton>
              <DeepLedgerActionButton
                tone={executeSummary?.riskOverallStatus === "block" ? "danger" : "primary"}
                className="justify-center"
                onClick={() => void handleConfirmExecuteCycle()}
                disabled={busy || executeSummaryLoading || !executeSummary || executeSummary.riskOverallStatus === "block"}
              >
                {!executeSummary ? "摘要未就绪" : (executeSummary.riskOverallStatus === "block" ? "存在阻断，无法执行" : "确认执行")}
              </DeepLedgerActionButton>
            </div>
          )}
        >
          <div className="space-y-4">
            <div className={cn(deepLedgerSubtlePanelClassName, "space-y-1 px-4 py-3 text-sm text-[var(--muted)]")}>
              <div>模式：{pendingExecuteMode === "all" ? "执行全部建议" : "仅执行勾选建议"}</div>
              <div>周期：{currentCycle ? currentCycle.cycleId.slice(0, 8) : "-"}</div>
              <div>订单数：{executeSummary?.orderCount ?? (currentCycle ? currentCycle.proposals.filter((row) => pendingExecuteMode === "all" || row.selected).length : 0)}</div>
            </div>
            {executeSummaryLoading ? (
              <DeepLedgerEmptyState className="px-4 py-6" title="正在生成执行摘要..." description="请稍候，系统正在合并订单、手续费与风险结论。" />
            ) : null}
            {executeSummaryError ? <DeepLedgerNoticeBox tone="red" title="执行摘要生成失败" description={executeSummaryError} /> : null}
            {executeSummary ? (
              <div className="space-y-3">
                <div className={deepLedgerMonoPanelClassName}>
                  <div>总买入：{formatCurrency(executeSummary.buyNotional, bootstrap?.baseCurrency || "USD")}</div>
                  <div>总卖出：{formatCurrency(executeSummary.sellNotional, bootstrap?.baseCurrency || "USD")}</div>
                  <div>预计手续费：{formatCurrency(executeSummary.estimatedFees, bootstrap?.baseCurrency || "USD")}</div>
                  <div>净现金变化：{formatCurrency(executeSummary.netCashImpact, bootstrap?.baseCurrency || "USD")}</div>
                  <div>执行后最大仓位预估：{(executeSummary.topWeightChanges[0]?.projectedWeightPct || 0).toFixed(2)}%</div>
                </div>
                {executeSummary.riskWarnings.length > 0 ? (
                  <DeepLedgerNoticeBox tone="amber" title="风险提示" description={executeSummary.riskWarnings.join("；")} />
                ) : null}
              </div>
            ) : null}
          </div>
        </DeepLedgerDialogShell>
      </Dialog>
    </div>
  );
}
