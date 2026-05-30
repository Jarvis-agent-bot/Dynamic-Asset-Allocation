"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import { applyWorkbenchTargetWeights } from "@/src/daa/modules/workbench/targetAllocationApply";
import { runBacktest, getBacktestHistory } from "@/src/daa/modules/strategyLab/strategyLabApi";
import type {
  StrategyLabRunParams,
  StrategyLabBenchmarkResult,
  StrategyLabRunResult,
  StrategyLabStrategyResult,
  StrategyLabHistoryItem,
} from "@/src/daa/modules/strategyLab/strategyLabTypes";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";
import {
  summarizeStrategyLabWarnings,
  type StrategyLabWarningPresentation,
} from "./strategyLabWarningPresentation";
import { buildStrategyLabChartData } from "./strategyLabChartData";

export const STRATEGY_OPTIONS = [
  { key: "equalWeight", label: "等权重", desc: "按相同比例配置所有资产" },
  { key: "momentum", label: "动量", desc: "超配近期表现好的资产" },
  { key: "riskParity", label: "风险平价", desc: "按波动率倒数分配权重" },
  { key: "minVariance", label: "最小方差", desc: "最小化组合整体波动率" },
  { key: "baseline", label: "基准等权", desc: "与等权相同，用作对照" },
] as const;

export const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "月度" },
  { value: "quarterly", label: "季度" },
  { value: "semiannual", label: "半年" },
  { value: "annual", label: "年度" },
] as const;

export const BASE_CURRENCY_OPTIONS = ["USD", "HKD", "CNY"] as const;

export function strategyLabel(key: string): string {
  return STRATEGY_OPTIONS.find((s) => s.key === key)?.label ?? key;
}

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return toLocalDateInputValue(d);
}

function defaultEndDate(): string {
  return toLocalDateInputValue(new Date());
}

export type ConfigState = {
  selectedAssets: string[];
  selectedStrategies: string[];
  startDate: string;
  endDate: string;
  rebalanceFrequency: string;
  initialCapital: number;
  baseCurrency: string;
};

const DEFAULT_CONFIG: ConfigState = {
  selectedAssets: [],
  selectedStrategies: ["equalWeight"],
  startDate: defaultStartDate(),
  endDate: defaultEndDate(),
  rebalanceFrequency: "monthly",
  initialCapital: 100_000,
  baseCurrency: "USD",
};

export interface UseStrategyLabResult {
  assets: AssetUniverseView[];
  assetsLoading: boolean;
  filteredAssets: AssetUniverseView[];
  assetFilter: string;
  setAssetFilter: Dispatch<SetStateAction<string>>;

  config: ConfigState;
  setConfig: Dispatch<SetStateAction<ConfigState>>;
  toggleAsset: (assetKey: string) => void;
  toggleStrategy: (key: string) => void;
  reuseHistoryParams: (item: StrategyLabHistoryItem) => void;

  running: boolean;
  result: StrategyLabRunResult | null;
  error: string;
  runBacktest: () => Promise<void>;

  applying: boolean;
  applyTargetWeights: () => Promise<void>;

  history: StrategyLabHistoryItem[];
  historyLoading: boolean;
  loadHistory: () => Promise<void>;

  strategyResults: StrategyLabStrategyResult[];
  benchmarkResults: StrategyLabBenchmarkResult[];
  chartData: Array<Record<string, string | number>>;
  warningSummary: StrategyLabWarningPresentation;

  canRun: boolean;
  canApply: boolean;
}

export function useStrategyLab(): UseStrategyLabResult {
  const [assets, setAssets] = useState<AssetUniverseView[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [assetFilter, setAssetFilter] = useState("");

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StrategyLabRunResult | null>(null);
  const [error, setError] = useState("");

  const [applying, setApplying] = useState(false);

  const [history, setHistory] = useState<StrategyLabHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const model = await getWorkbenchReadModel({ syncPrices: false });
        if (!cancelled) {
          setAssets(model.bootstrap.assetUniverse);
          const defaultSelection = model.bootstrap.assetUniverse
            .filter((a) => a.holdingQty > 0 || a.watchEnabled)
            .map((a) => a.assetKey);
          setConfig((prev) => ({
            ...prev,
            selectedAssets: defaultSelection.length > 0 ? defaultSelection : prev.selectedAssets,
            baseCurrency: model.bootstrap.baseCurrency || prev.baseCurrency,
          }));
        }
      } catch {
        // 静默处理，用户可手动输入资产
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await getBacktestHistory(10);
      setHistory(items);
    } catch {
      // 静默处理
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const runBacktestFn = useCallback(async () => {
    if (running) return;
    if (config.selectedAssets.length === 0) {
      setError("请至少选择一个资产");
      return;
    }
    if (config.selectedStrategies.length === 0) {
      setError("请至少选择一个策略");
      return;
    }
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const params: StrategyLabRunParams = {
        assets: config.selectedAssets,
        strategies: config.selectedStrategies,
        startDate: config.startDate,
        endDate: config.endDate,
        rebalanceFrequency: config.rebalanceFrequency,
        initialCapital: config.initialCapital,
        baseCurrency: config.baseCurrency,
      };
      const res = await runBacktest(params);
      setResult(res);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "回测执行失败");
    } finally {
      setRunning(false);
    }
  }, [running, config, loadHistory]);

  const applyTargetWeightsFn = useCallback(async () => {
    if (!result?.targetWeights || Object.keys(result.targetWeights).length === 0) return;
    setApplying(true);
    try {
      await applyWorkbenchTargetWeights(result.targetWeights);
      const nextModel = await getWorkbenchReadModel({ syncPrices: false });
      setAssets(nextModel.bootstrap.assetUniverse);
      toast.success("已将回测权重应用为目标配置");
    } catch (err) {
      toast.error("应用失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setApplying(false);
    }
  }, [result]);

  const toggleAsset = useCallback((assetKey: string) => {
    setConfig((prev) => ({
      ...prev,
      selectedAssets: prev.selectedAssets.includes(assetKey)
        ? prev.selectedAssets.filter((k) => k !== assetKey)
        : [...prev.selectedAssets, assetKey],
    }));
  }, []);

  const toggleStrategy = useCallback((key: string) => {
    setConfig((prev) => ({
      ...prev,
      selectedStrategies: prev.selectedStrategies.includes(key)
        ? prev.selectedStrategies.filter((k) => k !== key)
        : [...prev.selectedStrategies, key],
    }));
  }, []);

  const reuseHistoryParams = useCallback((item: StrategyLabHistoryItem) => {
    const p = item.params;
    if (!p) return;
    setConfig({
      selectedAssets: Array.isArray(p.assets) ? [...p.assets] : [],
      selectedStrategies: Array.isArray(p.strategies) && p.strategies.length > 0 ? [...p.strategies] : ["equalWeight"],
      startDate: p.startDate || defaultStartDate(),
      endDate: p.endDate || defaultEndDate(),
      rebalanceFrequency: p.rebalanceFrequency || "monthly",
      initialCapital: Number.isFinite(p.initialCapital) && p.initialCapital > 0 ? p.initialCapital : 100_000,
      baseCurrency: p.baseCurrency || "USD",
    });
    toast.message("已载入历史参数，可直接重新运行");
  }, []);

  const filteredAssets = useMemo(() => {
    if (!assetFilter.trim()) return assets;
    const q = assetFilter.trim().toLowerCase();
    return assets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.assetKey.toLowerCase().includes(q) ||
        a.assetClass.toLowerCase().includes(q),
    );
  }, [assets, assetFilter]);

  const strategyResults = useMemo<StrategyLabStrategyResult[]>(() => {
    if (!result) return [];
    if (result.strategyResults?.length) return result.strategyResults;
    return [{
      strategy: result.params.strategies[0] || "equalWeight",
      equityCurve: result.equityCurve,
      metrics: result.metrics,
      attribution: result.attribution,
      targetWeights: result.targetWeights || {},
      warnings: [],
    }];
  }, [result]);

  const benchmarkResults = useMemo<StrategyLabBenchmarkResult[]>(
    () => result?.benchmarkResults ?? [],
    [result?.benchmarkResults],
  );

  const chartData = useMemo(() => {
    return buildStrategyLabChartData({ result, strategyResults, benchmarkResults });
  }, [result, strategyResults, benchmarkResults]);

  const warningSummary = useMemo(
    () => summarizeStrategyLabWarnings(result?.warnings ?? []),
    [result?.warnings],
  );

  const canRun = !running && config.selectedAssets.length > 0 && config.selectedStrategies.length > 0;
  const canApply = Boolean(result?.targetWeights && Object.keys(result.targetWeights).length > 0) && !applying;

  return {
    assets,
    assetsLoading,
    filteredAssets,
    assetFilter,
    setAssetFilter,
    config,
    setConfig,
    toggleAsset,
    toggleStrategy,
    reuseHistoryParams,
    running,
    result,
    error,
    runBacktest: runBacktestFn,
    applying,
    applyTargetWeights: applyTargetWeightsFn,
    history,
    historyLoading,
    loadHistory,
    strategyResults,
    benchmarkResults,
    chartData,
    warningSummary,
    canRun,
    canApply,
  };
}
