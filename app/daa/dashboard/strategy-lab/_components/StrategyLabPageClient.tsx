"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BarChart3, ChevronDown, ChevronUp, FlaskConical, Gauge, RefreshCcw, RotateCcw, SlidersHorizontal, Target, TrendingUp } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DeepLedgerActionButton,
  DeepLedgerEmptyState,
  DeepLedgerFilterChip,
  DeepLedgerMetricCard,
  DeepLedgerMiniStat,
  DeepLedgerNoticeBox,
  DeepLedgerPageHeader,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  deepLedgerDenseFieldClassName,
  deepLedgerMonoPanelClassName,
  deepLedgerSubtlePanelClassName,
  deepLedgerTableShellClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import { getSystemConfigV2 } from "@/src/daa/modules/store/storeApiV1";
import { getStrategyExecutionConfigV2 } from "@/src/daa/config/systemConfigV2";
import { buildTargetWeightDiffRowsV1 } from "@/src/daa/modules/strategyLab/strategyLabEngineV1";
import { runStrategyLabApiV1, writeStrategyLabTargetWeightsApiV1 } from "@/src/daa/modules/strategyLab/strategyLabApiV1";
import type {
  StrategyLabAlignmentModeV1,
  StrategyLabCandidateScenarioComparisonV1,
  StrategyLabRunAssetInputV1,
  StrategyLabRunCandidateViewV1,
  StrategyLabRunResultV1,
  StrategyLabRunScenarioIdV1,
  StrategyLabRunScenarioViewV1,
} from "@/src/daa/modules/strategyLab/strategyLabContractsV1";
import type { StrategyLabEnsembleConfigV1 } from "@/src/daa/modules/strategyLab/strategyLabTypesV1";
import { getWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchApiV1";
import type { AssetUniverseViewV1, WorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

const EQUITY_COLORS: Record<string, string> = {
  benchmark: "#94A3B8",
  baseline: "#38BDF8",
  momentum: "#34D399",
  riskParity: "#F59E0B",
  minVariance: "#A78BFA",
  equalWeight: "#F472B6",
  ensemble: "#F97316",
};

const DEFAULT_ENSEMBLE: StrategyLabEnsembleConfigV1 = {
  momentum: 0.4,
  riskParity: 0.25,
  minVariance: 0.15,
  equalWeight: 0.2,
};

type StrategyLabStyleKeyV1 = keyof StrategyLabEnsembleConfigV1;

const STRATEGY_STYLE_META_V1: Record<StrategyLabStyleKeyV1, { label: string; shortLabel: string; description: string }> = {
  momentum: {
    label: "趋势进攻",
    shortLabel: "趋势",
    description: "更相信强势资产会继续跑赢，适合想提高收益弹性的实验。",
  },
  riskParity: {
    label: "风险平衡",
    shortLabel: "平衡",
    description: "尽量避免单一高波动资产主导结果，适合控制组合波动。",
  },
  minVariance: {
    label: "低波防守",
    shortLabel: "防守",
    description: "优先压低组合波动和回撤，更适合防守型实验。",
  },
  equalWeight: {
    label: "均衡基线",
    shortLabel: "基线",
    description: "不给任何资产额外偏见，适合做最朴素的对照组。",
  },
};

const ENSEMBLE_PRESETS_V1: Array<{ id: string; label: string; description: string; config: StrategyLabEnsembleConfigV1 }> = [
  {
    id: "balanced",
    label: "均衡默认",
    description: "四种风格一起参与，适合作为第一轮基准。",
    config: DEFAULT_ENSEMBLE,
  },
  {
    id: "offense",
    label: "偏进攻",
    description: "提高趋势权重，接受更高波动换取更大弹性。",
    config: {
      momentum: 0.55,
      riskParity: 0.2,
      minVariance: 0.1,
      equalWeight: 0.15,
    },
  },
  {
    id: "defense",
    label: "偏防守",
    description: "提高低波与风险平衡权重，更关注回撤控制。",
    config: {
      momentum: 0.2,
      riskParity: 0.3,
      minVariance: 0.35,
      equalWeight: 0.15,
    },
  },
];

const CANDIDATE_TAG_LABEL_V1: Record<string, string> = {
  baseline: "当前配置",
  momentum: "趋势进攻",
  riskParity: "风险平衡",
  minVariance: "低波防守",
  equalWeight: "均衡基线",
  ensemble: "组合候选",
};

const WORKBENCH_LINK_CLASSNAME_V1 =
  "inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--text)]";

const RESEARCH_WEIGHT_SLIDER_CLASSNAME_V1 =
  "h-2 w-full cursor-pointer appearance-none rounded-full bg-transparent disabled:cursor-not-allowed disabled:opacity-45";

function todayIsoV1(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoV1(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatPercent01V1(value: number, digits = 2): string {
  return formatPercent((Number(value) || 0) * 100, digits);
}

function formatSharePctV1(value: number, digits = 0): string {
  const numeric = Number(value) || 0;
  return `${(numeric * 100).toFixed(digits)}%`;
}

function clampWeightPctV1(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function formatSignedPercentV1(value: number, digits = 2): string {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) <= 1e-8) return formatPercent(0, digits);
  return `${numeric > 0 ? "+" : "-"}${formatPercent(Math.abs(numeric), digits)}`;
}

function describeTargetBudgetV1(totalPct: number): {
  tone: "green" | "amber" | "red";
  label: string;
  progressPct: number;
} {
  const numeric = Math.max(0, Number(totalPct) || 0);
  if (numeric >= 99.5 && numeric <= 100.5) {
    return { tone: "green", label: "已归一到 100%", progressPct: 100 };
  }
  if (numeric < 100) {
    return {
      tone: "amber",
      label: `还差 ${formatPercent(100 - numeric)} 到 100%`,
      progressPct: numeric,
    };
  }
  return {
    tone: "red",
    label: `超出 ${formatPercent(numeric - 100)}，建议回到 100% 再运行`,
    progressPct: 100,
  };
}

function formatSignedCurrencyV1(value: number, currency: string): string {
  const numeric = Number(value) || 0;
  const formatted = formatCurrency(Math.abs(numeric), currency);
  if (Math.abs(numeric) <= 1e-8) return formatted;
  return `${numeric > 0 ? "+" : "-"}${formatted}`;
}

function formatSignedNumberV1(value: number, digits = 2): string {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) <= 1e-8) return (0).toFixed(digits);
  return `${numeric > 0 ? "+" : "-"}${Math.abs(numeric).toFixed(digits)}`;
}

function formatSignedIntegerV1(value: number): string {
  const numeric = Math.trunc(Number(value) || 0);
  if (numeric === 0) return "0";
  return `${numeric > 0 ? "+" : "-"}${Math.abs(numeric)}`;
}

function buildResearchTargetWeightPctMapV1(rows: AssetUniverseViewV1[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const row of rows) {
    next[row.assetKey] = clampWeightPctV1(Number(row.targetWeightPct) || 0);
  }
  return next;
}

function toUniverseAssetInputV1(row: AssetUniverseViewV1): StrategyLabRunAssetInputV1 {
  return {
    assetKey: row.assetKey,
    symbol: row.symbol,
    market: row.market,
    currency: row.currency,
    label: `${row.symbol}${row.market ? ` · ${row.market}` : ""}`,
    yfinanceSymbol: row.yfinanceSymbol,
    currentWeightPct: row.actualWeightPct,
    currentTargetWeightPct: row.targetWeightPct,
    holdingQty: row.holdingQty,
    watchEnabled: row.watchEnabled,
  };
}

function candidateToneV1(id: string, bestId: string | null): "cyan" | "green" | "amber" | "indigo" | "slate" {
  if (id === bestId) return "green";
  if (id === "baseline") return "cyan";
  if (id === "ensemble") return "amber";
  return "indigo";
}

function normalizeSelectedAssetKeysV1(rows: AssetUniverseViewV1[]): string[] {
  const preferred = rows.filter((row) => row.yfinanceSymbol && (row.watchEnabled || row.holdingQty > 0));
  if (preferred.length > 0) return preferred.map((row) => row.assetKey);
  return rows.filter((row) => row.yfinanceSymbol).slice(0, 8).map((row) => row.assetKey);
}

function scenarioToneV1(id: StrategyLabRunScenarioIdV1): "amber" | "cyan" {
  return id === "executable" ? "amber" : "cyan";
}

function deltaToneV1(value: number): "green" | "amber" | "red" | "slate" {
  const numeric = Number(value) || 0;
  if (numeric >= 0.02) return "green";
  if (numeric <= -0.05) return "red";
  if (numeric < 0) return "amber";
  return "slate";
}

function executionGapToneV1(value: number): "green" | "amber" | "red" | "slate" {
  const numeric = Number(value) || 0;
  if (numeric >= 0.05) return "red";
  if (numeric > 0) return "amber";
  if (numeric <= -0.02) return "green";
  return "slate";
}

function describeExecutionGapV1(value: number): { label: string; displayValue: string } {
  const numeric = Number(value) || 0;
  if (numeric > 1e-6) {
    return { label: "执行折损", displayValue: formatPercent01V1(numeric) };
  }
  if (numeric < -1e-6) {
    return { label: "执行反超", displayValue: formatPercent01V1(Math.abs(numeric)) };
  }
  return { label: "执行差异", displayValue: formatPercent01V1(0) };
}

function describeReturnImpactV1(value: number): { tone: "green" | "amber" | "red" | "slate"; label: string; displayValue: string } {
  const numeric = Number(value) || 0;
  if (numeric > 1e-6) {
    return { tone: executionGapToneV1(numeric), label: "收益拖累", displayValue: formatPercent01V1(numeric) };
  }
  if (numeric < -1e-6) {
    return { tone: "green", label: "收益反超", displayValue: formatPercent01V1(Math.abs(numeric)) };
  }
  return { tone: "slate", label: "收益影响", displayValue: formatPercent01V1(0) };
}

function pickOtherScenarioIdV1(scenarioId: StrategyLabRunScenarioIdV1): StrategyLabRunScenarioIdV1 {
  return scenarioId === "ideal" ? "executable" : "ideal";
}

function pickScenarioRankV1(
  comparison: StrategyLabCandidateScenarioComparisonV1 | null | undefined,
  scenarioId: StrategyLabRunScenarioIdV1,
): number | null {
  if (!comparison) return null;
  return scenarioId === "ideal" ? comparison.idealRank : comparison.executableRank;
}

function describeRankShiftV1(value: number | null): { tone: "green" | "amber" | "slate"; text: string } {
  if (value == null) return { tone: "slate", text: "缺少另一视图排名" };
  if (value < 0) return { tone: "green", text: `另一视图提升 ${Math.abs(value)} 名` };
  if (value > 0) return { tone: "amber", text: `另一视图下降 ${value} 名` };
  return { tone: "slate", text: "两边综合排名一致" };
}

function toCooldownHoursV1(seconds: number): number {
  return Math.max(0, Number(seconds) || 0) / 3600;
}

type StrategyLabCheckSeverityV1 = "error" | "warn";

type StrategyLabCheckV1 = {
  severity: StrategyLabCheckSeverityV1;
  message: string;
};

function buildStrategyLabPreflightChecksV1(input: {
  selectedAssets: AssetUniverseViewV1[];
  selectedAssetCount: number;
  targetSumPct: number;
  initialEquity: number;
  minTradeNotional: number;
  maxOrderPctOfNav: number;
  baseCurrency: string;
}): StrategyLabCheckV1[] {
  const checks: StrategyLabCheckV1[] = [];
  const minTradeNotional = Math.max(0, Number(input.minTradeNotional) || 0);
  const maxOrderPctOfNav = Math.max(0, Number(input.maxOrderPctOfNav) || 0);
  const singleOrderCap = Math.max(0, Number(input.initialEquity) || 0) * maxOrderPctOfNav;
  const hasBuyGap = input.selectedAssets.some((row) => Number(row.targetWeightPct || 0) > Number(row.actualWeightPct || 0) + 0.01);
  const hasSellGap = input.selectedAssets.some((row) => Number(row.actualWeightPct || 0) > Number(row.targetWeightPct || 0) + 0.01);

  if (input.selectedAssetCount <= 0) {
    checks.push({ severity: "error", message: "至少选择 1 个有历史行情的资产后才能运行策略实验。" });
    return checks;
  }

  if (input.selectedAssetCount === 1) {
    checks.push({ severity: "error", message: "当前只有 1 个实验资产，候选策略几乎没有区分度；请至少扩展到 2-3 个资产再运行。" });
  }

  if (input.targetSumPct <= 0) {
    checks.push({ severity: "error", message: "当前研究目标权重总和为 0%，baseline 无法形成有效组合。请先在研究资产池里填写实验权重，或回工作台维护正式目标。" });
  }

  if (minTradeNotional > 0 && input.initialEquity < minTradeNotional) {
    checks.push({ severity: "error", message: `初始资金 ${formatCurrency(input.initialEquity, input.baseCurrency)} 低于最小成交额 ${formatCurrency(minTradeNotional, input.baseCurrency)}，本轮无法形成有效成交。` });
  }

  if (minTradeNotional > 0 && hasBuyGap && singleOrderCap < minTradeNotional) {
    checks.push({ severity: "error", message: `当前单笔 NAV 上限 ${formatCurrency(singleOrderCap, input.baseCurrency)}（${formatPercent(maxOrderPctOfNav * 100, 2)}）低于最小成交额 ${formatCurrency(minTradeNotional, input.baseCurrency)}，买入信号会被系统性压制。` });
  }

  if (minTradeNotional > 0 && hasSellGap && singleOrderCap < minTradeNotional) {
    checks.push({ severity: "error", message: `当前单笔 NAV 上限 ${formatCurrency(singleOrderCap, input.baseCurrency)}（${formatPercent(maxOrderPctOfNav * 100, 2)}）低于最小成交额 ${formatCurrency(minTradeNotional, input.baseCurrency)}，卖出信号会被系统性压制。` });
  }

  if (minTradeNotional > 0 && input.initialEquity < input.selectedAssetCount * minTradeNotional) {
    checks.push({ severity: "warn", message: `当前初始资金只覆盖约 ${Math.floor(input.initialEquity / Math.max(minTradeNotional, 1))} 笔最小成交额，多资产候选会明显受成交门槛影响。` });
  }

  if (input.targetSumPct > 100.5 || input.targetSumPct < 99.5) {
    const cashHint = input.targetSumPct < 100 ? `约 ${(100 - input.targetSumPct).toFixed(2)}% 现金` : `约 ${(input.targetSumPct - 100).toFixed(2)}% 超额目标`;
    checks.push({ severity: "warn", message: `当前目标权重总和为 ${input.targetSumPct.toFixed(2)}%，这意味着组合会隐含 ${cashHint}。` });
  }

  return checks;
}

function normalizeFingerprintNumberV1(value: number, digits = 8): number {
  const numeric = Number(value) || 0;
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

function summarizeWarningListV1(warnings: string[]): string[] {
  const summary: string[] = [];
  const seen = new Set<string>();
  let blockedAllTrades = 0;
  let buySuppressed = 0;
  let sellSuppressed = 0;
  let maxInSuppressed = false;
  let maxOutSuppressed = false;

  for (const raw of warnings) {
    const warning = String(raw || "").trim();
    if (!warning) continue;
    if (warning.includes("blocks all trades")) {
      blockedAllTrades += 1;
      continue;
    }
    if (warning.includes("min order size: BUY")) {
      buySuppressed += 1;
      continue;
    }
    if (warning.includes("min order size: SELL")) {
      sellSuppressed += 1;
      continue;
    }
    if (warning.includes("constraints.maxIn=")) {
      maxInSuppressed = true;
      continue;
    }
    if (warning.includes("constraints.maxOut=")) {
      maxOutSuppressed = true;
      continue;
    }
    if (seen.has(warning)) continue;
    seen.add(warning);
    summary.push(warning);
  }

  if (blockedAllTrades > 0) {
    summary.unshift(`有 ${blockedAllTrades} 次候选调仓被最小成交额完全阻塞，本轮结果会明显受执行门槛影响。`);
  }
  if (buySuppressed > 0) {
    summary.push(`有 ${buySuppressed} 次买入信号因为最小成交额或整手规则被截断。`);
  }
  if (sellSuppressed > 0) {
    summary.push(`有 ${sellSuppressed} 次卖出信号因为最小成交额或整手规则被截断。`);
  }
  if (maxInSuppressed) {
    summary.push("当前单笔 NAV 上限过低，买入信号可能被系统性压制。");
  }
  if (maxOutSuppressed) {
    summary.push("当前单笔 NAV 上限过低，卖出信号可能被系统性压制。");
  }

  return summary;
}

function buildStrategyLabRunFingerprintV1(input: {
  selectedAssets: AssetUniverseViewV1[];
  startDate: string;
  endDate: string;
  benchmarkSymbol: string;
  alignmentMode: StrategyLabAlignmentModeV1;
  minBars: number;
  lookbackBars: number;
  initialEquity: number;
  slippageBps: number;
  feeRateBps: number;
  ensembleConfig: StrategyLabEnsembleConfigV1;
  constraints: { maxPositionPct: number; minNotional: number; maxOrderPctOfNav: number };
  policy: { thresholdPct: number; minTradeNotional: number; cooldownSeconds: number };
}): string {
  return JSON.stringify({
    assets: input.selectedAssets.map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      currency: row.currency,
      yfinanceSymbol: row.yfinanceSymbol,
      currentWeightPct: normalizeFingerprintNumberV1(row.actualWeightPct),
      targetWeightPct: normalizeFingerprintNumberV1(row.targetWeightPct),
    })),
    startDate: input.startDate,
    endDate: input.endDate,
    benchmarkSymbol: input.benchmarkSymbol.trim().toUpperCase(),
    alignmentMode: input.alignmentMode,
    minBars: Math.max(0, Number(input.minBars) || 0),
    lookbackBars: Math.max(0, Number(input.lookbackBars) || 0),
    initialEquity: normalizeFingerprintNumberV1(input.initialEquity),
    slippageBps: Math.max(0, Number(input.slippageBps) || 0),
    feeRateBps: normalizeFingerprintNumberV1(input.feeRateBps),
    ensembleConfig: {
      momentum: normalizeFingerprintNumberV1(input.ensembleConfig.momentum),
      riskParity: normalizeFingerprintNumberV1(input.ensembleConfig.riskParity),
      minVariance: normalizeFingerprintNumberV1(input.ensembleConfig.minVariance),
      equalWeight: normalizeFingerprintNumberV1(input.ensembleConfig.equalWeight),
    },
    constraints: {
      maxPositionPct: normalizeFingerprintNumberV1(input.constraints.maxPositionPct),
      minNotional: normalizeFingerprintNumberV1(input.constraints.minNotional),
      maxOrderPctOfNav: normalizeFingerprintNumberV1(input.constraints.maxOrderPctOfNav),
    },
    policy: {
      thresholdPct: normalizeFingerprintNumberV1(input.policy.thresholdPct),
      minTradeNotional: normalizeFingerprintNumberV1(input.policy.minTradeNotional),
      cooldownSeconds: Math.max(0, Number(input.policy.cooldownSeconds) || 0),
    },
  });
}

function buildResultReadinessV1(input: {
  result: StrategyLabRunResultV1 | null;
  selectedScenario: StrategyLabRunScenarioViewV1 | null;
  selectedCandidate: StrategyLabRunCandidateViewV1 | null;
  warningSummary: string[];
}) {
  if (!input.result || !input.selectedCandidate) return null;

  const result = input.result;
  const selectedCandidate = input.selectedCandidate;
  let tone: "green" | "amber" | "red" = "green";
  const items: string[] = [];
  const summary = selectedCandidate.backtest.summary;
  const mergedWarnings = [...result.warnings, ...selectedCandidate.backtest.warnings];

  if (result.assetsUsed.length <= 1) {
    tone = "red";
    items.push("当前仍然是单资产样本，多策略结果更像持仓敏感性检查，不适合作为候选优选。");
  }

  if (summary.turnoverNotional <= 0) {
    tone = "red";
    items.push("样本期没有发生任何实际成交，本轮结果基本等于静态持有，缺少策略验证意义。");
  } else if (summary.rebalanceCount <= 0) {
    if (tone !== "red") tone = "amber";
    items.push("这轮结果主要来自初始建仓后的持有表现，还没有充分验证后续调仓逻辑。");
  } else if (summary.rebalanceCount === 1) {
    if (tone !== "red") tone = "amber";
    items.push("样本期只触发了 1 次再平衡，策略稳定性仍需要更长周期或更多资产样本验证。");
  }

  if (mergedWarnings.some((warning) => warning.includes("blocks all trades") || warning.includes("constraints.maxIn=") || warning.includes("constraints.maxOut="))) {
    if (tone !== "red") tone = "amber";
    items.push("执行约束正在显著影响结果，当前更适合把它当成“可执行组合”研究，而不是纯策略优选。");
  }

  const bestCandidate = input.selectedScenario?.candidates.find((item) => item.id === input.selectedScenario?.bestCandidateId) || input.selectedScenario?.candidates[0] || null;
  if (bestCandidate && bestCandidate.id === selectedCandidate.id && selectedCandidate.attribution.activeReturn < 0) {
    if (tone !== "red") tone = "amber";
    items.push(`当前“最佳候选”按综合评分选出，并没有跑赢 ${result.benchmark.symbol}；如果你更在意绝对收益，需要手动比较候选收益列。`);
  }

  if (items.length <= 0 && input.warningSummary.length <= 0) {
    items.push("本轮样本覆盖完整，且没有明显的执行性阻塞，可以作为较可信的一轮研究输入。");
  }

  return {
    tone,
    title: tone === "green" ? "结果可信度较高" : tone === "amber" ? "结果需要结合边界解读" : "结果可信度偏低",
    description: "先确认这轮回测是不是“可比较、可执行、可解释”的，再决定是否写回。",
    items,
  };
}

export default function StrategyLabPageClient() {
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [selectedAssetKeys, setSelectedAssetKeys] = useState<string[]>([]);
  const [researchTargetWeightPctByAssetKey, setResearchTargetWeightPctByAssetKey] = useState<Record<string, number>>({});
  const [startDate, setStartDate] = useState(daysAgoIsoV1(730));
  const [endDate, setEndDate] = useState(todayIsoV1());
  const [benchmarkSymbol, setBenchmarkSymbol] = useState("SPY");
  const [alignmentMode, setAlignmentMode] = useState<StrategyLabAlignmentModeV1>("intersection");
  const [minBars, setMinBars] = useState(252);
  const [lookbackBars, setLookbackBars] = useState(252);
  const [initialEquity, setInitialEquity] = useState(100000);
  const [slippageBps, setSlippageBps] = useState(0);
  const [ensembleConfig, setEnsembleConfig] = useState<StrategyLabEnsembleConfigV1>(DEFAULT_ENSEMBLE);
  const [constraints, setConstraints] = useState<{ maxPositionPct: number; minNotional: number; maxOrderPctOfNav: number }>({
    maxPositionPct: 0.3,
    minNotional: 200,
    maxOrderPctOfNav: 0.1,
  });
  const [policy, setPolicy] = useState<{ thresholdPct: number; minTradeNotional: number; cooldownSeconds: number }>({
    thresholdPct: 0.05,
    minTradeNotional: 200,
    cooldownSeconds: 72 * 3600,
  });
  const [systemDefaults, setSystemDefaults] = useState<{
    constraints: { maxPositionPct: number; minNotional: number; maxOrderPctOfNav: number };
    policy: { thresholdPct: number; minTradeNotional: number; cooldownSeconds: number };
    execution: { feeRateBps: number; slippageBps: number };
  } | null>(null);
  const [feeRateBps, setFeeRateBps] = useState(5);
  const [loadingContext, setLoadingContext] = useState(true);
  const [running, setRunning] = useState(false);
  const [writingBack, setWritingBack] = useState(false);
  const [result, setResult] = useState<StrategyLabRunResultV1 | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<StrategyLabRunScenarioIdV1>("executable");
  const [selectedCandidateId, setSelectedCandidateId] = useState<StrategyLabRunCandidateViewV1["id"] | null>(null);
  const [lastRunFingerprint, setLastRunFingerprint] = useState<string | null>(null);
  const [showResearchFrame, setShowResearchFrame] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  const [showEquityChart, setShowEquityChart] = useState(false);
  const [equityChartWidth, setEquityChartWidth] = useState(0);
  const equityChartContainerRef = useRef<HTMLDivElement | null>(null);

  const loadContext = useCallback(async () => {
    setLoadingContext(true);
    try {
      const [nextBootstrap, system] = await Promise.all([
        getWorkbenchBootstrapV1(),
        getSystemConfigV2(),
      ]);

      setBootstrap(nextBootstrap);
      const systemBaseCurrency = system.config.strategy.account.baseCurrency || nextBootstrap.baseCurrency || "USD";
      setBaseCurrency(systemBaseCurrency);

      const rows = nextBootstrap.assetUniverse || [];
      setSelectedAssetKeys((prev) => {
        if (prev.length > 0) return prev;
        return normalizeSelectedAssetKeysV1(rows);
      });

      const computedEquity = (nextBootstrap.account.totalEquity ?? 0) > 0
        ? Number(nextBootstrap.account.totalEquity)
        : rows.reduce((sum, row) => sum + Math.max(0, Number(row.valuationBase || 0)), 0) + Math.max(0, Number(nextBootstrap.account.cash || 0));
      setInitialEquity(Math.max(1000, computedEquity || 100000));

      const executionDefaults = getStrategyExecutionConfigV2(system.config);
      const nextConstraints = {
        maxPositionPct: Number(system.config.strategy.constraints.maxPositionPct) || 0.3,
        minNotional: Number(system.config.strategy.constraints.minNotional) || 200,
        maxOrderPctOfNav: executionDefaults.maxOrderPctOfNav,
      };
      const nextPolicy = {
        thresholdPct: Number(system.config.rebalanceStrategy.drift.thresholdPct) || 0.05,
        minTradeNotional: Number(system.config.strategy.constraints.minNotional) || 200,
        cooldownSeconds: (Number(system.config.rebalanceStrategy.cooldownHours) || 72) * 3600,
      };
      setConstraints(nextConstraints);
      setPolicy(nextPolicy);
      setFeeRateBps(executionDefaults.feeRateBps);
      setSlippageBps(executionDefaults.slippageBps);
      setSystemDefaults({
        constraints: nextConstraints,
        policy: nextPolicy,
        execution: {
          feeRateBps: executionDefaults.feeRateBps,
          slippageBps: executionDefaults.slippageBps,
        },
      });
    } catch (error) {
      toast.error(getApiErrorMessageV1(error));
    } finally {
      setLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const availableAssets = useMemo(() => {
    return (bootstrap?.assetUniverse || []).filter((row) => Boolean(row.yfinanceSymbol));
  }, [bootstrap]);

  useEffect(() => {
    setResearchTargetWeightPctByAssetKey((prev) => {
      const next: Record<string, number> = {};
      for (const row of availableAssets) {
        const fromWorkbench = clampWeightPctV1(Number(row.targetWeightPct) || 0);
        next[row.assetKey] = prev[row.assetKey] == null ? fromWorkbench : clampWeightPctV1(prev[row.assetKey]);
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      const changed = prevKeys.length !== nextKeys.length || nextKeys.some((key) => Math.abs((prev[key] ?? -1) - next[key]) > 1e-8);
      return changed ? next : prev;
    });
  }, [availableAssets]);

  const sourceSelectedAssets = useMemo(() => {
    const selected = new Set(selectedAssetKeys);
    return availableAssets.filter((row) => selected.has(row.assetKey));
  }, [availableAssets, selectedAssetKeys]);

  const selectedAssets = useMemo(() => {
    return sourceSelectedAssets.map((row) => {
      const nextTargetWeightPct = researchTargetWeightPctByAssetKey[row.assetKey] == null
        ? Math.max(0, Number(row.targetWeightPct) || 0)
        : clampWeightPctV1(researchTargetWeightPctByAssetKey[row.assetKey]);
      return {
        ...row,
        targetWeightPct: nextTargetWeightPct,
        targetWeightHint: nextTargetWeightPct / 100,
      };
    });
  }, [researchTargetWeightPctByAssetKey, sourceSelectedAssets]);

  const selectedAssetCount = selectedAssets.length;
  const selectedHoldingCount = selectedAssets.filter((row) => row.holdingQty > 0).length;
  const selectedTargetSumPct = selectedAssets.reduce((sum, row) => sum + Math.max(0, Number(row.targetWeightPct || 0)), 0);
  const workbenchSelectedTargetSumPct = sourceSelectedAssets.reduce((sum, row) => sum + Math.max(0, Number(row.targetWeightPct || 0)), 0);
  const researchTargetOverrideActive = useMemo(() => sourceSelectedAssets.some((row) => {
    const researchTarget = researchTargetWeightPctByAssetKey[row.assetKey] == null
      ? Math.max(0, Number(row.targetWeightPct || 0))
      : clampWeightPctV1(researchTargetWeightPctByAssetKey[row.assetKey]);
    return Math.abs(researchTarget - Math.max(0, Number(row.targetWeightPct || 0))) > 0.01;
  }), [researchTargetWeightPctByAssetKey, sourceSelectedAssets]);
  const researchTargetBudget = useMemo(() => describeTargetBudgetV1(selectedTargetSumPct), [selectedTargetSumPct]);
  const targetComparisonRows = useMemo(() => {
    return sourceSelectedAssets
      .map((row) => {
        const workbenchTargetPct = clampWeightPctV1(Number(row.targetWeightPct) || 0);
        const researchTargetPct = researchTargetWeightPctByAssetKey[row.assetKey] == null
          ? workbenchTargetPct
          : clampWeightPctV1(researchTargetWeightPctByAssetKey[row.assetKey]);
        const deltaPct = researchTargetPct - workbenchTargetPct;
        return {
          assetKey: row.assetKey,
          symbol: row.symbol,
          market: row.market,
          workbenchTargetPct,
          researchTargetPct,
          deltaPct,
          changed: Math.abs(deltaPct) > 0.01,
        };
      })
      .sort((left, right) => {
        if (left.changed !== right.changed) return left.changed ? -1 : 1;
        const deltaGap = Math.abs(right.deltaPct) - Math.abs(left.deltaPct);
        if (Math.abs(deltaGap) > 0.01) return deltaGap > 0 ? 1 : -1;
        const weightGap = right.researchTargetPct - left.researchTargetPct;
        if (Math.abs(weightGap) > 0.01) return weightGap > 0 ? 1 : -1;
        return left.symbol.localeCompare(right.symbol);
      });
  }, [researchTargetWeightPctByAssetKey, sourceSelectedAssets]);
  const changedResearchTargetCount = useMemo(
    () => targetComparisonRows.filter((row) => row.changed).length,
    [targetComparisonRows],
  );
  const ensembleInputSum = useMemo(
    () => Object.values(ensembleConfig).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0),
    [ensembleConfig],
  );
  const normalizedEnsembleRows = useMemo(() => {
    const keys = Object.keys(STRATEGY_STYLE_META_V1) as StrategyLabStyleKeyV1[];
    if (ensembleInputSum <= 0) {
      return keys.map((key) => ({
        key,
        rawValue: Math.max(0, Number(ensembleConfig[key]) || 0),
        normalizedValue: 0,
      }));
    }
    return keys.map((key) => ({
      key,
      rawValue: Math.max(0, Number(ensembleConfig[key]) || 0),
      normalizedValue: Math.max(0, Number(ensembleConfig[key]) || 0) / ensembleInputSum,
    }));
  }, [ensembleConfig, ensembleInputSum]);
  const selectedAssetSummary = useMemo(() => {
    if (!selectedAssetCount) return "当前工作台还没有可回测资产，先去工作台补标的后再回来做实验。";
    const preview = selectedAssets.slice(0, 4).map((row) => row.symbol).join(" / ");
    const assetText = selectedAssetCount > 4 ? `${preview} 等 ${selectedAssetCount} 个标的` : preview;
    if (selectedTargetSumPct <= 0) return `${assetText} · 研究目标尚未设置`;
    return `${assetText} · 研究目标 ${formatPercent(selectedTargetSumPct)}`;
  }, [selectedAssetCount, selectedAssets, selectedTargetSumPct]);
  const researchFrameSummary = useMemo(() => {
    return [
      `${startDate} → ${endDate}`,
      `基准 ${benchmarkSymbol}`,
      alignmentMode === "intersection" ? "公共交易日" : "并集 + 前值填充",
      `walk-forward ${lookbackBars} bar`,
      `最少 ${minBars} bar`,
      `初始 ${formatCurrency(initialEquity, baseCurrency)}`,
    ].join(" · ");
  }, [alignmentMode, baseCurrency, benchmarkSymbol, endDate, initialEquity, lookbackBars, minBars, startDate]);
  const advancedExecutionSummary = useMemo(() => {
    return [
      `费用 ${feeRateBps.toFixed(2)} bps`,
      `滑点 ${slippageBps} bps`,
      `单笔 NAV 上限 ${formatSharePctV1(constraints.maxOrderPctOfNav, 1)}`,
      `仓位上限 ${formatSharePctV1(constraints.maxPositionPct)}`,
      `最小成交额 ${formatCurrency(constraints.minNotional, baseCurrency)}`,
      "时点 T+1 close",
    ].join(" · ");
  }, [baseCurrency, constraints.maxOrderPctOfNav, constraints.maxPositionPct, constraints.minNotional, feeRateBps, slippageBps]);

  const scenarioMap = useMemo(() => {
    return new Map((result?.scenarios || []).map((item) => [item.scenarioId, item] as const));
  }, [result]);

  const candidateComparisonMap = useMemo(() => {
    return new Map((result?.candidateComparisons || []).map((item) => [item.candidateId, item] as const));
  }, [result]);

  const selectedScenario = useMemo<StrategyLabRunScenarioViewV1 | null>(() => {
    if (!result) return null;
    return scenarioMap.get(selectedScenarioId) || result.scenarios.find((item) => item.scenarioId === result.defaultScenarioId) || result.scenarios[0] || null;
  }, [result, scenarioMap, selectedScenarioId]);

  const selectedCandidate = useMemo<StrategyLabRunCandidateViewV1 | null>(() => {
    if (!selectedScenario) return null;
    return selectedScenario.candidates.find((item) => item.id === selectedCandidateId)
      || selectedScenario.candidates.find((item) => item.id === selectedScenario.bestCandidateId)
      || selectedScenario.candidates[0]
      || null;
  }, [selectedCandidateId, selectedScenario]);

  const currentRunFingerprint = useMemo(() => buildStrategyLabRunFingerprintV1({
    selectedAssets,
    startDate,
    endDate,
    benchmarkSymbol,
    alignmentMode,
    minBars,
    lookbackBars,
    initialEquity,
    slippageBps,
    feeRateBps,
    ensembleConfig,
    constraints,
    policy,
  }), [alignmentMode, benchmarkSymbol, constraints, endDate, ensembleConfig, feeRateBps, initialEquity, lookbackBars, minBars, policy, selectedAssets, slippageBps, startDate]);

  const assetLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of result?.assetsUsed || []) {
      map.set(row.assetKey, row.label || row.symbol || row.assetKey);
    }
    return map;
  }, [result]);

  const equityChartRows = useMemo(() => {
    if (!result || !selectedScenario || selectedScenario.candidates.length <= 0) return [];
    const dates = selectedScenario.candidates[0]?.backtest.dates || [];
    return dates.map((date, index) => {
      const row: Record<string, string | number | null> = {
        date: date.slice(5),
        benchmark: result.benchmark.equity[index] != null ? (result.benchmark.equity[index] - 1) * 100 : null,
      };
      for (const candidate of selectedScenario.candidates) {
        row[candidate.id] = candidate.backtest.equity[index] != null ? (candidate.backtest.equity[index] - 1) * 100 : null;
      }
      return row;
    });
  }, [result, selectedScenario]);

  useEffect(() => {
    if (!result || equityChartRows.length <= 0) {
      setShowEquityChart(false);
      return;
    }
    setShowEquityChart(false);
    const frame = requestAnimationFrame(() => setShowEquityChart(true));
    return () => cancelAnimationFrame(frame);
  }, [equityChartRows.length, result, selectedScenarioId]);

  useEffect(() => {
    if (!showEquityChart) {
      setEquityChartWidth(0);
      return;
    }
    const node = equityChartContainerRef.current;
    if (!node) return;

    const updateWidth = () => {
      setEquityChartWidth(Math.max(0, Math.floor(node.clientWidth)));
    };

    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, [showEquityChart]);

  const sourceTargetWeightsByAssetKey = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of sourceSelectedAssets) {
      const weight = Math.max(0, Number(row.targetWeightPct || 0)) / 100;
      if (weight <= 0) continue;
      out[row.assetKey] = weight;
    }
    return out;
  }, [sourceSelectedAssets]);

  const selectedDiffRows = useMemo(() => {
    if (!result || !selectedCandidate) return [];
    return buildTargetWeightDiffRowsV1(sourceTargetWeightsByAssetKey, selectedCandidate.targetWeights);
  }, [result, selectedCandidate, sourceTargetWeightsByAssetKey]);

  const topContributors = useMemo(() => {
    return (selectedCandidate?.attribution.perAsset || []).slice(0, 6);
  }, [selectedCandidate]);

  const preflightChecks = useMemo(() => buildStrategyLabPreflightChecksV1({
    selectedAssets,
    selectedAssetCount,
    targetSumPct: selectedTargetSumPct,
    initialEquity,
    minTradeNotional: policy.minTradeNotional,
    maxOrderPctOfNav: constraints.maxOrderPctOfNav,
    baseCurrency,
  }), [baseCurrency, constraints.maxOrderPctOfNav, initialEquity, policy.minTradeNotional, selectedAssetCount, selectedAssets, selectedTargetSumPct]);

  const blockingPreflightChecks = useMemo(() => preflightChecks.filter((item) => item.severity === "error"), [preflightChecks]);
  const advisoryPreflightChecks = useMemo(() => preflightChecks.filter((item) => item.severity === "warn"), [preflightChecks]);

  const warningSummary = useMemo(() => summarizeWarningListV1([
    ...(result?.warnings || []),
    ...(selectedScenario?.warnings || []),
    ...(selectedCandidate?.backtest.warnings || []),
  ]), [result, selectedCandidate, selectedScenario]);

  const resultReadiness = useMemo(() => buildResultReadinessV1({
    result,
    selectedScenario,
    selectedCandidate,
    warningSummary,
  }), [result, selectedCandidate, selectedScenario, warningSummary]);

  const idealScenario = scenarioMap.get("ideal") || null;
  const executableScenario = scenarioMap.get("executable") || null;

  const selectedCandidateScenarioComparison = useMemo(() => {
    const candidateId = selectedCandidate?.id || selectedCandidateId;
    if (!candidateId || !idealScenario || !executableScenario) return null;
    const comparison = candidateComparisonMap.get(candidateId) || null;
    const idealCandidate = idealScenario.candidates.find((item) => item.id === candidateId) || null;
    const executableCandidate = executableScenario.candidates.find((item) => item.id === candidateId) || null;
    if (!comparison || !idealCandidate || !executableCandidate) return null;
    const currentScenario = selectedScenario?.scenarioId || "executable";
    const otherScenarioId = pickOtherScenarioIdV1(currentScenario);
    const currentRank = pickScenarioRankV1(comparison, currentScenario);
    const otherRank = pickScenarioRankV1(comparison, otherScenarioId);
    return {
      ...comparison,
      idealCandidate,
      executableCandidate,
      currentScenarioId: currentScenario,
      otherScenarioId,
      currentRank,
      otherRank,
      rankShift: currentRank != null && otherRank != null ? otherRank - currentRank : null,
    };
  }, [candidateComparisonMap, executableScenario, idealScenario, selectedCandidate, selectedCandidateId, selectedScenario]);

  const executionGapMeta = useMemo(() => {
    if (!selectedCandidateScenarioComparison) return null;
    return describeExecutionGapV1(selectedCandidateScenarioComparison.executionGap);
  }, [selectedCandidateScenarioComparison]);

  const selectedCandidateRankMeta = useMemo(() => {
    if (!selectedCandidateScenarioComparison) return null;
    return describeRankShiftV1(selectedCandidateScenarioComparison.rankShift);
  }, [selectedCandidateScenarioComparison]);

  const usingSystemExecutionDefaults = useMemo(() => {
    if (!systemDefaults) return true;
    return Math.abs(systemDefaults.constraints.maxPositionPct - constraints.maxPositionPct) <= 1e-8
      && Math.abs(systemDefaults.constraints.minNotional - constraints.minNotional) <= 1e-8
      && Math.abs(systemDefaults.constraints.maxOrderPctOfNav - constraints.maxOrderPctOfNav) <= 1e-8
      && Math.abs(systemDefaults.policy.thresholdPct - policy.thresholdPct) <= 1e-8
      && Math.abs(systemDefaults.policy.minTradeNotional - policy.minTradeNotional) <= 1e-8
      && Math.abs(systemDefaults.policy.cooldownSeconds - policy.cooldownSeconds) <= 1e-8
      && Math.abs(systemDefaults.execution.feeRateBps - feeRateBps) <= 1e-8
      && Math.abs(systemDefaults.execution.slippageBps - slippageBps) <= 1e-8;
  }, [constraints, feeRateBps, policy, slippageBps, systemDefaults]);

  const resultIsStale = Boolean(result) && lastRunFingerprint !== null && lastRunFingerprint !== currentRunFingerprint;

  const canRun = selectedAssetCount >= 1 && blockingPreflightChecks.length <= 0 && !running && !loadingContext;

  async function handleRun() {
    if (!canRun) return;
    if (blockingPreflightChecks.length > 0) {
      toast.error(blockingPreflightChecks[0]?.message || "当前实验设置不满足运行条件");
      return;
    }
    if (startDate > endDate) {
      toast.error("开始日期不能晚于结束日期");
      return;
    }
    if (advisoryPreflightChecks.length > 0) {
      toast.warning(advisoryPreflightChecks[0]?.message || "当前结果会受到实验边界影响");
    }
    const requestFingerprint = currentRunFingerprint;
    setRunning(true);
    try {
      const next = await runStrategyLabApiV1({
        assets: selectedAssets.map(toUniverseAssetInputV1),
        startDate,
        endDate,
        benchmarkSymbol,
        alignmentMode,
        minBars,
        lookbackBars,
        baseCurrency,
        ensembleConfig,
        initialEquity,
        constraints,
        policy,
        execution: {
          timing: "t_plus_1_close",
          feeRateBps,
          slippageBps,
        },
      });
      setResult(next);
      setSelectedScenarioId(next.defaultScenarioId || "executable");
      const nextDefaultScenario = next.scenarios.find((item) => item.scenarioId === (next.defaultScenarioId || "executable")) || next.scenarios[0] || null;
      setSelectedCandidateId(nextDefaultScenario?.bestCandidateId || nextDefaultScenario?.candidates[0]?.id || next.bestCandidateId || next.candidates[0]?.id || null);
      setLastRunFingerprint(requestFingerprint);
      toast.success(`策略实验室运行完成，生成 ${next.candidates.length} 组候选。`);
    } catch (error) {
      toast.error(getApiErrorMessageV1(error));
    } finally {
      setRunning(false);
    }
  }

  async function handleWritebackCurrentTarget() {
    if (!result || !selectedCandidate || writingBack) return;
    if (resultIsStale) {
      toast.error("当前结果已经不是这套实验配置的最新输出，请重新运行后再写回工作台。");
      return;
    }
    if (Object.keys(selectedCandidate.targetWeights || {}).length <= 0) {
      toast.error("当前候选还没有形成可写回的目标权重，请先使用有有效 walk-forward 窗口的结果。");
      return;
    }
    setWritingBack(true);
    try {
      const writeback = await writeStrategyLabTargetWeightsApiV1({
        candidateId: selectedCandidate.id,
        scopeAssetKeys: result.assetsUsed.map((item) => item.assetKey),
        weightsByAssetKey: selectedCandidate.targetWeights,
      });
      setResult((prev) => prev ? {
        ...prev,
        currentTargetWeights: { ...selectedCandidate.targetWeights },
      } : prev);
      setBootstrap((prev) => prev ? {
        ...prev,
        assetUniverse: prev.assetUniverse.map((row) => {
          if (!result.assetsUsed.some((item) => item.assetKey === row.assetKey)) return row;
          const nextWeight = Number(selectedCandidate.targetWeights[row.assetKey] || 0);
          return {
            ...row,
            watchEnabled: nextWeight > 0 ? true : row.watchEnabled,
            targetWeightHint: nextWeight,
            targetWeightPct: nextWeight * 100,
          };
        }),
      } : prev);
      setResearchTargetWeightPctByAssetKey((prev) => {
        const next = { ...prev };
        for (const asset of result.assetsUsed) {
          next[asset.assetKey] = clampWeightPctV1(Number(selectedCandidate.targetWeights[asset.assetKey] || 0) * 100);
        }
        return next;
      });
      if (writeback.updatedCount <= 0 && !writeback.clearedConfigTargetWeights) {
        toast.message("当前目标已与该候选一致，无需写回。");
      } else {
        toast.success(`已将 ${selectedCandidate.label} 写回为当前目标。`);
      }
      await loadContext();
    } catch (error) {
      toast.error(getApiErrorMessageV1(error));
    } finally {
      setWritingBack(false);
    }
  }

  function resetAdvancedExecutionSettings() {
    if (!systemDefaults) return;
    setConstraints(systemDefaults.constraints);
    setPolicy(systemDefaults.policy);
    setFeeRateBps(systemDefaults.execution.feeRateBps);
    setSlippageBps(systemDefaults.execution.slippageBps);
  }

  function toggleAsset(assetKey: string) {
    setSelectedAssetKeys((prev) => {
      const set = new Set(prev);
      if (set.has(assetKey)) set.delete(assetKey);
      else set.add(assetKey);
      return [...set];
    });
  }

  function setResearchTargetWeightPct(assetKey: string, nextValue: number) {
    setResearchTargetWeightPctByAssetKey((prev) => ({
      ...prev,
      [assetKey]: clampWeightPctV1(nextValue),
    }));
  }

  function resetResearchTargetWeights() {
    setResearchTargetWeightPctByAssetKey(buildResearchTargetWeightPctMapV1(availableAssets));
    toast.success("已恢复为工作台目标权重。");
  }

  function applyEqualResearchTargetWeights() {
    if (!selectedAssets.length) return;
    const each = Number((100 / selectedAssets.length).toFixed(4));
    setResearchTargetWeightPctByAssetKey((prev) => {
      const next = { ...prev };
      for (const row of selectedAssets) next[row.assetKey] = each;
      return next;
    });
    toast.success("已按选中资产平均分配研究目标权重。");
  }

  function normalizeResearchTargetWeights() {
    if (!selectedAssets.length) return;
    const sum = selectedAssets.reduce((acc, row) => acc + Math.max(0, Number(row.targetWeightPct || 0)), 0);
    if (sum <= 0) {
      applyEqualResearchTargetWeights();
      return;
    }
    setResearchTargetWeightPctByAssetKey((prev) => {
      const next = { ...prev };
      for (const row of selectedAssets) {
        next[row.assetKey] = Number(((Math.max(0, Number(row.targetWeightPct || 0)) / sum) * 100).toFixed(4));
      }
      return next;
    });
    toast.success("已把当前研究权重归一到 100%。");
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <DeepLedgerPageHeader
        title="策略实验室"
        description="这页不负责建仓，只负责对工作台已有资产做候选回测；先比较理想/可执行差异，再决定是否把目标权重写回。"
        actions={(
          <DeepLedgerActionButton onClick={() => void loadContext()} disabled={loadingContext}>
            <RefreshCcw className={`h-4 w-4 ${loadingContext ? "animate-spin" : ""}`} />
            刷新上下文
          </DeepLedgerActionButton>
        )}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DeepLedgerMetricCard label="实验资产" value={`${selectedAssetCount}`} subLabel={`其中持仓 ${selectedHoldingCount} 个`} accent="cyan" />
        <DeepLedgerMetricCard
          label="研究目标和"
          value={formatPercent(selectedTargetSumPct)}
          subLabel={researchTargetOverrideActive ? `已覆写工作台目标 ${formatPercent(workbenchSelectedTargetSumPct)}` : `当前跟随工作台目标 ${formatPercent(workbenchSelectedTargetSumPct)}`}
          accent="indigo"
        />
        <DeepLedgerMetricCard label="回测起点资金" value={formatCurrency(initialEquity, baseCurrency)} subLabel={`基准币 ${baseCurrency}`} accent="amber" />
        <DeepLedgerMetricCard label="回测区间" value={`${startDate.slice(2)} → ${endDate.slice(2)}`} subLabel={`${alignmentMode === "intersection" ? "公共交易日" : "并集前值填充"} · walk-forward ${lookbackBars} bar · 最少 ${minBars} bar`} accent="green" />
      </div>

      <DeepLedgerPanel
        accent="cyan"
        title="先定义这轮实验"
        subtitle="只先处理三件事：研究哪些资产、组合风格往哪边偏、这轮要不要验证真实执行摩擦。"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerActionButton tone="slate" onClick={() => setSelectedAssetKeys(normalizeSelectedAssetKeysV1(availableAssets))}>
              <RotateCcw className="h-4 w-4" />
              重置资产选择
            </DeepLedgerActionButton>
            <DeepLedgerActionButton tone="primary" data-testid="strategy-lab-run-button" onClick={() => void handleRun()} disabled={!canRun}>
              <FlaskConical className={`h-4 w-4 ${running ? "animate-pulse" : ""}`} />
              {running ? "运行中..." : "运行策略实验"}
            </DeepLedgerActionButton>
          </div>
        )}
      >
        {preflightChecks.length > 0 ? (
          <div className="mb-4">
            <DeepLedgerNoticeBox
              tone={blockingPreflightChecks.length > 0 ? "red" : "amber"}
              title={blockingPreflightChecks.length > 0 ? "运行前需要先修正这些问题" : "运行前提示"}
              description="先确保样本可比较、可成交，再运行回测，结果会更可靠。"
              icon={<AlertTriangle className="h-4 w-4" />}
            >
              <ul className="space-y-2 pl-4 text-sm text-[var(--muted)]">
                {preflightChecks.map((item) => (
                  <li key={`${item.severity}-${item.message}`} className="list-disc">
                    {item.message}
                  </li>
                ))}
              </ul>
            </DeepLedgerNoticeBox>
          </div>
        ) : null}
        <div className="space-y-4">
          <div className="space-y-4">
            <div className={deepLedgerSubtlePanelClassName + " p-4"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <BarChart3 className="h-4 w-4 text-[var(--primary)]" />
                    研究假设
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    日期、基准和样本对齐方式通常保持默认；只有你在做不同窗口或基准对照时，再展开修改。
                  </div>
                </div>
                <DeepLedgerActionButton tone="slate" onClick={() => setShowResearchFrame((prev) => !prev)}>
                  {showResearchFrame ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showResearchFrame ? "收起研究假设" : "展开研究假设"}
                </DeepLedgerActionButton>
              </div>
              <div className="mt-3 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-3 py-3 text-sm text-[var(--muted)]">
                {researchFrameSummary}
              </div>
              {showResearchFrame ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">开始日期</div>
                    <input className={deepLedgerDenseFieldClassName} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">结束日期</div>
                    <input className={deepLedgerDenseFieldClassName} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">基准</div>
                    <input className={deepLedgerDenseFieldClassName} value={benchmarkSymbol} onChange={(e) => setBenchmarkSymbol(e.target.value.toUpperCase())} placeholder="SPY" />
                  </label>
                  <label className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">对齐模式</div>
                    <select className={deepLedgerDenseFieldClassName} value={alignmentMode} onChange={(e) => setAlignmentMode(e.target.value as StrategyLabAlignmentModeV1)}>
                      <option value="intersection">公共交易日</option>
                      <option value="ffill_union">并集 + 前值填充</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">最少对齐 bar</div>
                    <input className={deepLedgerDenseFieldClassName} type="number" min={20} step={5} value={minBars} onChange={(e) => setMinBars(Math.max(20, Number(e.target.value) || 20))} />
                  </label>
                  <label className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">滚动窗口</div>
                    <input className={deepLedgerDenseFieldClassName} type="number" min={20} step={5} value={lookbackBars} onChange={(e) => setLookbackBars(Math.max(20, Number(e.target.value) || 20))} />
                  </label>
                  <label className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">初始资金</div>
                    <input className={deepLedgerDenseFieldClassName} type="number" min={1000} step={1000} value={initialEquity} onChange={(e) => setInitialEquity(Math.max(1000, Number(e.target.value) || 1000))} />
                  </label>
                </div>
              ) : null}
            </div>

            <div className={deepLedgerSubtlePanelClassName + " p-4"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <SlidersHorizontal className="h-4 w-4 text-[var(--amber)]" />
                    高级执行约束
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    默认先收起。只有你想验证“真实执行摩擦会把结果拉低多少”时，再展开这些参数。
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <DeepLedgerStatusPill tone={usingSystemExecutionDefaults ? "green" : "amber"}>
                    {usingSystemExecutionDefaults ? "继承系统默认" : "本次实验已覆写"}
                  </DeepLedgerStatusPill>
                  <DeepLedgerActionButton tone="slate" onClick={() => setShowAdvancedSettings((prev) => !prev)}>
                    {showAdvancedSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {showAdvancedSettings ? "收起高级设置" : "展开高级设置"}
                  </DeepLedgerActionButton>
                </div>
              </div>

              <div className="mt-3 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-3 py-3 text-sm text-[var(--muted)]">
                {advancedExecutionSummary}
              </div>

              {showAdvancedSettings ? (
                <>
                  <div className="mt-3 flex justify-end">
                    <DeepLedgerActionButton tone="slate" onClick={resetAdvancedExecutionSettings} disabled={!systemDefaults || usingSystemExecutionDefaults}>
                      <RotateCcw className="h-4 w-4" />
                      恢复系统默认
                    </DeepLedgerActionButton>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">费用率 (bps)</div>
                      <input className={deepLedgerDenseFieldClassName} type="number" min={0} step={0.1} value={feeRateBps} onChange={(e) => setFeeRateBps(Math.max(0, Number(e.target.value) || 0))} />
                    </label>
                    <label className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">滑点 bps</div>
                      <input className={deepLedgerDenseFieldClassName} type="number" min={0} step={1} value={slippageBps} onChange={(e) => setSlippageBps(Math.max(0, Number(e.target.value) || 0))} />
                    </label>
                    <label className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">仓位上限</div>
                      <input className={deepLedgerDenseFieldClassName} type="number" min={0} max={1} step={0.05} value={constraints.maxPositionPct} onChange={(e) => setConstraints((prev) => ({ ...prev, maxPositionPct: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }))} />
                    </label>
                    <label className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">最小成交额</div>
                      <input className={deepLedgerDenseFieldClassName} type="number" min={0} step={50} value={constraints.minNotional} onChange={(e) => setConstraints((prev) => ({ ...prev, minNotional: Math.max(0, Number(e.target.value) || 0) }))} />
                    </label>
                    <label className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">单笔 NAV 上限</div>
                      <input className={deepLedgerDenseFieldClassName} type="number" min={0} max={1} step={0.01} value={constraints.maxOrderPctOfNav} onChange={(e) => setConstraints((prev) => ({ ...prev, maxOrderPctOfNav: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }))} />
                    </label>
                    <label className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">漂移阈值</div>
                      <input className={deepLedgerDenseFieldClassName} type="number" min={0} step={0.01} value={policy.thresholdPct} onChange={(e) => setPolicy((prev) => ({ ...prev, thresholdPct: Math.max(0, Number(e.target.value) || 0) }))} />
                    </label>
                    <label className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">策略最小调仓额</div>
                      <input className={deepLedgerDenseFieldClassName} type="number" min={0} step={50} value={policy.minTradeNotional} onChange={(e) => setPolicy((prev) => ({ ...prev, minTradeNotional: Math.max(0, Number(e.target.value) || 0) }))} />
                    </label>
                    <label className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">冷却时间（小时）</div>
                      <input className={deepLedgerDenseFieldClassName} type="number" min={0} step={1} value={toCooldownHoursV1(policy.cooldownSeconds)} onChange={(e) => setPolicy((prev) => ({ ...prev, cooldownSeconds: Math.max(0, Number(e.target.value) || 0) * 3600 }))} />
                    </label>
                  </div>
                </>
              ) : null}
            </div>

            <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(7,12,20,0.76)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <SlidersHorizontal className="h-4 w-4 text-[var(--primary)]" />
                    组合风格配比
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    这里调的是四种风格在 ensemble 候选里的相对权重，不是最终持仓权重；系统会自动归一化，所以你不用手动凑满 100%。
                  </div>
                </div>
                <DeepLedgerStatusPill tone={ensembleInputSum <= 0 ? "amber" : Math.abs(ensembleInputSum - 1) <= 0.01 ? "green" : "cyan"}>
                  输入合计 {formatSharePctV1(ensembleInputSum)}
                </DeepLedgerStatusPill>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {ENSEMBLE_PRESETS_V1.map((preset) => (
                  <DeepLedgerActionButton key={preset.id} tone="slate" className="rounded-full px-3 py-1.5 text-xs" onClick={() => setEnsembleConfig({ ...preset.config })}>
                    {preset.label}
                  </DeepLedgerActionButton>
                ))}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {normalizedEnsembleRows.map(({ key, rawValue, normalizedValue }) => {
                  const meta = STRATEGY_STYLE_META_V1[key];
                  return (
                    <label key={key} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.55)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">{meta.label}</div>
                          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{meta.description}</div>
                        </div>
                        <DeepLedgerStatusPill tone="indigo">归一后 {formatSharePctV1(normalizedValue)}</DeepLedgerStatusPill>
                      </div>
                      <div className="mt-4 space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">输入权重（%）</div>
                        <input
                          className={deepLedgerDenseFieldClassName}
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={Math.round(rawValue * 100)}
                          onChange={(e) => setEnsembleConfig((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) / 100 }))}
                        />
                        <div className="text-[11px] leading-5 text-[var(--faint)]">例如输入 40，表示这轮组合候选更偏向让“{meta.shortLabel}”主导。</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-[22px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(10,14,24,0.96),rgba(6,10,18,0.98))] p-4 shadow-[0_24px_50px_rgba(0,0,0,0.24)]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">研究资产池</div>
                <div className="flex flex-wrap items-center gap-2">
                  <DeepLedgerStatusPill tone="cyan">已选 {selectedAssetCount} / {availableAssets.length}</DeepLedgerStatusPill>
                  <DeepLedgerStatusPill tone={researchTargetOverrideActive ? "amber" : "green"}>
                    {researchTargetOverrideActive ? "实验权重已覆写" : "跟随工作台目标"}
                  </DeepLedgerStatusPill>
                  <DeepLedgerStatusPill tone={selectedTargetSumPct > 99.5 && selectedTargetSumPct < 100.5 ? "green" : "slate"}>
                    研究目标 {formatPercent(selectedTargetSumPct)}
                  </DeepLedgerStatusPill>
                </div>
              </div>
              <div className="text-sm leading-6 text-[var(--muted)]">
                这里不仅能勾选研究资产，还能单独改这轮实验里的 baseline 资产配比；这些改动只影响本轮回测，不会自动写回工作台正式目标。
              </div>
            </div>
            <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-3 py-3 text-sm text-[var(--muted)]">
              {selectedAssetSummary}
            </div>
            {availableAssets.length <= 0 || selectedTargetSumPct <= 0 ? (
              <div className="rounded-[16px] border border-dashed border-[var(--border-strong)] bg-[rgba(8,12,20,0.44)] p-4">
                <div className="text-sm font-semibold text-[var(--text)]">
                  {availableAssets.length <= 0 ? "先把研究资产准备好" : "先给研究 baseline 填权重"}
                </div>
                <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  {availableAssets.length <= 0
                    ? "策略实验室默认读取工作台里的持仓和观察列表。当前为空时，先去资产发现加入标的，再回到这里做实验。"
                    : "你现在已经可以直接在下方资产列表里填写研究权重，不必先回工作台；只有当你想改正式目标时，才需要回观察列表维护。"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableAssets.length <= 0 ? (
                    <Link href="/daa/dashboard/workbench?tab=discovery" className={WORKBENCH_LINK_CLASSNAME_V1}>
                      去资产发现
                    </Link>
                  ) : (
                    <DeepLedgerActionButton tone="primary" onClick={() => setShowAssetPicker(true)}>
                      展开资产列表去设研究权重
                    </DeepLedgerActionButton>
                  )}
                  <Link href="/daa/dashboard/workbench?tab=watchlist" className={WORKBENCH_LINK_CLASSNAME_V1}>
                    去观察列表看正式目标
                  </Link>
                </div>
              </div>
            ) : null}
            <div className="space-y-3 rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[var(--text)]">正式目标 vs 本轮研究 baseline</div>
                <div className="flex flex-wrap items-center gap-2">
                  <DeepLedgerStatusPill tone={changedResearchTargetCount > 0 ? "amber" : "green"}>已调整 {changedResearchTargetCount} 个资产</DeepLedgerStatusPill>
                  <DeepLedgerStatusPill tone={researchTargetBudget.tone}>{researchTargetBudget.label}</DeepLedgerStatusPill>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <DeepLedgerMiniStat label="工作台正式目标" value={formatPercent(workbenchSelectedTargetSumPct)} hint="写回前不会被研究页自动改动" tone="slate" />
                <DeepLedgerMiniStat label="研究 baseline" value={formatPercent(selectedTargetSumPct)} hint="slider 会自动汇总到这里" tone={researchTargetBudget.tone === "green" ? "green" : researchTargetBudget.tone === "red" ? "red" : "amber"} />
                <DeepLedgerMiniStat label="已改资产数" value={`${changedResearchTargetCount}`} hint={changedResearchTargetCount > 0 ? "按变化幅度优先排序" : "当前与正式目标一致"} tone={changedResearchTargetCount > 0 ? "amber" : "slate"} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
                  <span>研究目标自动总和</span>
                  <span>{researchTargetBudget.label}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[rgba(148,163,184,0.16)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(100, researchTargetBudget.progressPct))}%`,
                      background: researchTargetBudget.tone === "green"
                        ? "rgba(52,211,153,0.9)"
                        : researchTargetBudget.tone === "red"
                          ? "rgba(248,113,113,0.9)"
                          : "rgba(246,173,85,0.9)",
                    }}
                  />
                </div>
              </div>
              <div className={deepLedgerTableShellClassName}>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
                        <th className="px-4 py-3">资产</th>
                        <th className="px-4 py-3 text-right">工作台正式目标</th>
                        <th className="px-4 py-3 text-right">研究 baseline</th>
                        <th className="px-4 py-3 text-right">变化</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetComparisonRows.length > 0 ? targetComparisonRows.map((row) => (
                        <tr key={row.assetKey} className="border-t border-[var(--border)] text-[var(--muted)]">
                          <td className="px-4 py-3">
                            <div className="font-medium text-[var(--text)]">{row.symbol}</div>
                            <div className="text-xs text-[var(--faint)]">{row.market}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-[var(--font-mono)]">{formatPercent(row.workbenchTargetPct)}</td>
                          <td className="px-4 py-3 text-right font-[var(--font-mono)]" style={{ color: row.changed ? "#38BDF8" : undefined }}>{formatPercent(row.researchTargetPct)}</td>
                          <td className="px-4 py-3 text-right font-[var(--font-mono)]" style={{ color: row.deltaPct > 0 ? "#34D399" : row.deltaPct < 0 ? "#F59E0B" : undefined }}>
                            {formatSignedPercentV1(row.deltaPct)}
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--muted)]">先勾选研究资产，双列对照会自动出现。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs leading-5 text-[var(--muted)]">
                资产行里会同步显示正式目标、研究目标和自动总和；长说明已单独占行，避免和操作按钮挤在一起。
              </div>
              <div className="flex flex-wrap gap-2">
                <DeepLedgerActionButton tone="slate" className="rounded-full px-3 py-1.5 text-xs whitespace-nowrap" onClick={resetResearchTargetWeights} disabled={!availableAssets.length}>
                  恢复工作台目标
                </DeepLedgerActionButton>
                <DeepLedgerActionButton tone="slate" className="rounded-full px-3 py-1.5 text-xs whitespace-nowrap" onClick={applyEqualResearchTargetWeights} disabled={!selectedAssetCount}>
                  选中资产平均分配
                </DeepLedgerActionButton>
                <DeepLedgerActionButton tone="slate" className="rounded-full px-3 py-1.5 text-xs whitespace-nowrap" onClick={normalizeResearchTargetWeights} disabled={!selectedAssetCount}>
                  归一到 100%
                </DeepLedgerActionButton>
                <DeepLedgerActionButton tone="slate" className="whitespace-nowrap" onClick={() => setShowAssetPicker((prev) => !prev)}>
                  {showAssetPicker ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showAssetPicker ? "收起资产列表" : "展开资产列表"}
                </DeepLedgerActionButton>
              </div>
            </div>
            {showAssetPicker ? (
              <div className="max-h-[560px] overflow-y-auto pr-1">
                <div className="min-w-0 space-y-3">
                  {availableAssets.map((row) => {
                    const checked = selectedAssetKeys.includes(row.assetKey);
                    const researchTargetWeightPct = researchTargetWeightPctByAssetKey[row.assetKey] == null
                      ? clampWeightPctV1(Number(row.targetWeightPct) || 0)
                      : clampWeightPctV1(researchTargetWeightPctByAssetKey[row.assetKey]);
                    const deltaPct = researchTargetWeightPct - clampWeightPctV1(Number(row.targetWeightPct) || 0);
                    return (
                      <div key={row.assetKey} className="rounded-[16px] border border-[var(--border)] bg-[rgba(10,15,24,0.72)] px-3 py-3 transition-colors hover:border-[var(--primary)]/30">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={checked} onChange={() => toggleAsset(row.assetKey)} className="mt-1 h-4 w-4 rounded border-[var(--border-strong)] bg-transparent" />
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <button type="button" onClick={() => toggleAsset(row.assetKey)} className="text-left text-sm font-semibold text-[var(--text)]">
                                    {row.symbol}
                                  </button>
                                  <DeepLedgerStatusPill tone={row.holdingQty > 0 ? "green" : row.watchEnabled ? "cyan" : "slate"}>
                                    {row.holdingQty > 0 ? "持仓" : row.watchEnabled ? "观察" : row.market}
                                  </DeepLedgerStatusPill>
                                  <DeepLedgerStatusPill tone={checked ? "cyan" : "slate"}>
                                    {checked ? "已纳入研究" : "未纳入研究"}
                                  </DeepLedgerStatusPill>
                                  <DeepLedgerStatusPill tone={Math.abs(deltaPct) > 0.01 ? "amber" : "slate"}>
                                    {Math.abs(deltaPct) > 0.01 ? `变化 ${formatSignedPercentV1(deltaPct)}` : "与正式目标一致"}
                                  </DeepLedgerStatusPill>
                                </div>
                              </div>
                              <DeepLedgerStatusPill tone={researchTargetWeightPct > 0 ? "indigo" : "slate"}>
                                研究目标 {formatPercent(researchTargetWeightPct)}
                              </DeepLedgerStatusPill>
                            </div>
                            <div className="rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.45)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                              正式目标 {formatPercent(row.targetWeightPct)} · 当前权重 {formatPercent(row.actualWeightPct)} · 行情 {row.yfinanceSymbol}
                            </div>
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]">
                                <span>拖动 slider 调整研究 baseline</span>
                                <span>{checked ? `自动总和 ${formatPercent(selectedTargetSumPct)}` : "勾选后可调整"}</span>
                              </div>
                              <input
                                className={RESEARCH_WEIGHT_SLIDER_CLASSNAME_V1}
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                disabled={!checked}
                                value={researchTargetWeightPct}
                                onChange={(e) => setResearchTargetWeightPct(row.assetKey, Number(e.target.value) || 0)}
                                style={{ accentColor: checked ? "#38BDF8" : "#475569" }}
                              />
                            </div>
                            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_116px] xl:items-end">
                              <div className="text-xs leading-5 text-[var(--muted)]">
                                左边看工作台正式目标，右边改这轮研究 baseline；只有点击“写回为当前目标”后，正式配置才会被更新。
                              </div>
                              <label className="space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">研究目标（%）</div>
                                <input
                                  className={deepLedgerDenseFieldClassName}
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  disabled={!checked}
                                  value={researchTargetWeightPct}
                                  onChange={(e) => setResearchTargetWeightPct(row.assetKey, Number(e.target.value) || 0)}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DeepLedgerPanel>

      {result ? (
        <>
          <DeepLedgerPanel
            accent="green"
            title="回测结果总览"
            subtitle={`基准 ${result.benchmark.symbol} · ${result.diagnostics.startDate || startDate} 至 ${result.diagnostics.endDate || endDate}`}
            action={(
              <div className="flex flex-wrap items-center gap-2">
                {result.scenarios.map((scenario) => (
                  <DeepLedgerFilterChip key={scenario.scenarioId} active={selectedScenario?.scenarioId === scenario.scenarioId} onClick={() => setSelectedScenarioId(scenario.scenarioId)}>
                    {scenario.label}
                  </DeepLedgerFilterChip>
                ))}
              </div>
            )}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DeepLedgerMetricCard
                label="当前视图最佳候选"
                value={selectedScenario ? (selectedScenario.candidates.find((item) => item.id === selectedScenario.bestCandidateId)?.label || "-") : "-"}
                subLabel={selectedScenario?.bestCandidateId && selectedScenario ? `score ${selectedScenario.candidates.find((item) => item.id === selectedScenario.bestCandidateId)?.score.toFixed(2)}` : "暂无"}
                accent="green"
              />
              <DeepLedgerMetricCard label="当前视图" value={selectedScenario?.label || "-"} subLabel={selectedScenario?.description || "-"} accent={selectedScenario ? scenarioToneV1(selectedScenario.scenarioId) : "cyan"} />
              <DeepLedgerMetricCard label="对齐后资产数" value={`${result.assetsUsed.length}`} subLabel={`剔除 ${result.diagnostics.droppedSymbols.length} 个`} accent="cyan" />
              <DeepLedgerMetricCard label="基准累计收益" value={formatPercent01V1(result.benchmark.totalReturn)} subLabel={result.benchmark.equity.length ? `样本 ${result.benchmark.equity.length} 个交易日` : "基准未对齐成功"} accent="indigo" />
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {result.scenarios.map((scenario) => {
                const bestCandidate = scenario.candidates.find((item) => item.id === scenario.bestCandidateId) || scenario.candidates[0] || null;
                const isActive = selectedScenario?.scenarioId === scenario.scenarioId;
                return (
                  <button
                    key={scenario.scenarioId}
                    type="button"
                    onClick={() => setSelectedScenarioId(scenario.scenarioId)}
                    className="rounded-[18px] border p-4 text-left transition-all"
                    style={{
                      borderColor: isActive ? "rgba(56,189,248,0.42)" : "var(--border)",
                      background: isActive ? "rgba(56,189,248,0.10)" : "rgba(10,15,24,0.72)",
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[var(--text)]">{scenario.label}</div>
                      <DeepLedgerStatusPill tone={scenarioToneV1(scenario.scenarioId)}>{scenario.scenarioId}</DeepLedgerStatusPill>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{scenario.description}</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <DeepLedgerMiniStat label="最佳候选" value={bestCandidate?.label || "-"} hint={bestCandidate ? `score ${bestCandidate.score.toFixed(2)}` : "暂无"} tone={scenarioToneV1(scenario.scenarioId)} />
                      <DeepLedgerMiniStat label="最佳收益" value={bestCandidate ? formatPercent01V1(bestCandidate.backtest.metrics.totalReturn) : "-"} hint={bestCandidate ? `Sharpe ${bestCandidate.backtest.metrics.sharpe.toFixed(2)}` : "暂无"} tone="green" />
                      <DeepLedgerMiniStat label="最佳回撤" value={bestCandidate ? formatPercent01V1(bestCandidate.backtest.metrics.maxDrawdown) : "-"} hint={bestCandidate ? `${bestCandidate.backtest.summary.rebalanceCount} 次再平衡` : "暂无"} tone="amber" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="min-w-0 rounded-[20px] border border-[var(--border)] bg-[rgba(9,14,24,0.74)] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <TrendingUp className="h-4 w-4 text-[var(--primary)]" />
                  候选净值曲线（相对收益 %）
                </div>
                <div ref={equityChartContainerRef} className="h-[340px] min-w-0">
                  {showEquityChart && equityChartWidth > 0 ? (
                    <LineChart width={Math.max(equityChartWidth, 320)} height={340} data={equityChartRows}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} minTickGap={18} />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} width={48} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 14,
                          border: "1px solid rgba(148,163,184,0.2)",
                          background: "rgba(12,18,28,0.96)",
                          color: "#E2E8F0",
                        }}
                        formatter={(value: number | string | undefined, name: string | undefined) => [typeof value === "number" ? `${value.toFixed(2)}%` : (value ?? "-"), name ?? ""]}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="benchmark" stroke={EQUITY_COLORS.benchmark} dot={false} strokeWidth={1.8} name={result.benchmark.symbol} />
                      {selectedScenario?.candidates.map((candidate) => (
                        <Line
                          key={candidate.id}
                          type="monotone"
                          dataKey={candidate.id}
                          stroke={EQUITY_COLORS[candidate.id] || "#38BDF8"}
                          dot={false}
                          strokeWidth={candidate.id === selectedCandidateId ? 3 : 1.8}
                          opacity={candidate.id === selectedCandidateId ? 1 : 0.74}
                          name={candidate.label}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-[16px] border border-dashed border-[var(--border)] bg-[rgba(8,12,20,0.38)] text-sm text-[var(--muted)]">
                      正在准备图表布局...
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {selectedScenario?.candidates.map((candidate) => {
                  const isActive = selectedCandidateId === candidate.id;
                  const comparison = candidateComparisonMap.get(candidate.id) || null;
                  const otherScenarioId = pickOtherScenarioIdV1(selectedScenario.scenarioId);
                  const currentRank = pickScenarioRankV1(comparison, selectedScenario.scenarioId);
                  const otherRank = pickScenarioRankV1(comparison, otherScenarioId);
                  const rankMeta = describeRankShiftV1(currentRank != null && otherRank != null ? otherRank - currentRank : null);
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      data-testid={`strategy-lab-candidate-${candidate.id}`}
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      className="w-full rounded-[18px] border p-4 text-left transition-all"
                      style={{
                        borderColor: isActive ? "rgba(56,189,248,0.4)" : "var(--border)",
                        background: isActive ? "rgba(56,189,248,0.10)" : "rgba(10,15,24,0.72)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">{candidate.label}</div>
                          <div className="mt-1 text-xs text-[var(--muted)]">Score {candidate.score.toFixed(2)} · 收益 {formatPercent01V1(candidate.backtest.metrics.totalReturn)}</div>
                          <div className="mt-1 text-[11px] text-[var(--faint)]">
                            当前视图 #{currentRank ?? "-"} · {otherScenarioId === "ideal" ? "理想视图" : "可执行视图"} #{otherRank ?? "-"}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <DeepLedgerStatusPill tone={candidateToneV1(candidate.id, selectedScenario?.bestCandidateId || null)}>
                            {candidate.id === selectedScenario?.bestCandidateId ? "当前最佳" : CANDIDATE_TAG_LABEL_V1[candidate.id] || candidate.id}
                          </DeepLedgerStatusPill>
                          <DeepLedgerStatusPill tone={rankMeta.tone}>
                            {rankMeta.text}
                          </DeepLedgerStatusPill>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[var(--muted)]">
                        <div>Sharpe {candidate.backtest.metrics.sharpe.toFixed(2)}</div>
                        <div>回撤 {formatPercent01V1(candidate.backtest.metrics.maxDrawdown)}</div>
                        <div>主动收益 {formatPercent01V1(candidate.attribution.activeReturn)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </DeepLedgerPanel>

          {selectedCandidate ? (
            <DeepLedgerPanel
              accent="amber"
              title={`候选详情 · ${selectedCandidate.label}`}
              subtitle={`当前查看 ${selectedScenario?.label || "候选结果"}：先看收益与回撤，再看目标权重变化与归因，最后决定是否写回工作台。`}
              action={(
                <div className="flex max-w-[420px] flex-col items-end gap-2">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link href="/daa/dashboard/workbench?tab=watchlist" className={WORKBENCH_LINK_CLASSNAME_V1}>
                      打开工作台
                    </Link>
                    <DeepLedgerActionButton tone="primary" data-testid="strategy-lab-writeback-button" onClick={() => void handleWritebackCurrentTarget()} disabled={writingBack || resultIsStale || Object.keys(selectedCandidate.targetWeights || {}).length <= 0}>
                      <Target className="h-4 w-4" />
                      {writingBack ? "写回中..." : resultIsStale ? "请先重新运行" : "写回为当前目标"}
                    </DeepLedgerActionButton>
                  </div>
                  <div className="max-w-[360px] text-right text-[11px] leading-5 text-[var(--muted)]">
                    写回的是候选目标权重，不是某个“理想执行结果”的订单明细；即使你在理想回测里选中候选，落地后仍会回到工作台按真实执行约束执行。
                  </div>
                </div>
              )}
            >
              {resultIsStale ? (
                <div className="mt-5">
                  <DeepLedgerNoticeBox
                    tone="amber"
                    title="当前结果已过期"
                    description="你已经修改了实验资产或执行参数，下面内容仍来自上一轮运行，仅供参考。"
                    icon={<AlertTriangle className="h-4 w-4" />}
                  >
                    <ul className="space-y-2 pl-4 text-sm text-[var(--muted)]">
                      <li className="list-disc">请重新运行策略实验后再判断候选优劣，避免把旧结果当成新配置的结论。</li>
                      <li className="list-disc">在重新运行前，系统会暂时禁止写回当前目标，避免误写工作台。</li>
                    </ul>
                  </DeepLedgerNoticeBox>
                </div>
              ) : null}

              {selectedScenario ? (
                <div className="mt-5">
                  <DeepLedgerNoticeBox
                    tone={scenarioToneV1(selectedScenario.scenarioId)}
                    title={`${selectedScenario.label} · 视图说明`}
                    description={selectedScenario.description}
                    icon={<SlidersHorizontal className="h-4 w-4" />}
                  >
                    <ul className="space-y-2 pl-4 text-sm text-[var(--muted)]">
                      {selectedScenario.assumptions.map((item) => (
                        <li key={item} className="list-disc">{item}</li>
                      ))}
                    </ul>
                  </DeepLedgerNoticeBox>
                </div>
              ) : null}

              {selectedCandidateScenarioComparison ? (
                <div className="mt-5 rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text)]">理想回测 vs 可执行回测</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">同一候选在两种执行假设下的差异，帮助你判断策略上限与真实落地之间的距离。</div>
                    </div>
                    <DeepLedgerStatusPill tone={executionGapToneV1(selectedCandidateScenarioComparison.executionGap)}>
                      {executionGapMeta?.label || "执行差异"} {executionGapMeta?.displayValue || formatPercent01V1(0)}
                    </DeepLedgerStatusPill>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <DeepLedgerMiniStat label="当前综合排名" value={selectedCandidateScenarioComparison.currentRank != null ? `#${selectedCandidateScenarioComparison.currentRank}` : "--"} hint={selectedCandidateScenarioComparison.currentScenarioId === "ideal" ? "当前查看理想回测" : "当前查看可执行回测"} tone="slate" />
                    <DeepLedgerMiniStat label="另一视图排名" value={selectedCandidateScenarioComparison.otherRank != null ? `#${selectedCandidateScenarioComparison.otherRank}` : "--"} hint={selectedCandidateRankMeta?.text || "缺少另一视图排名"} tone={selectedCandidateRankMeta?.tone || "slate"} />
                    <DeepLedgerMiniStat label="理想收益" value={formatPercent01V1(selectedCandidateScenarioComparison.idealCandidate.backtest.metrics.totalReturn)} hint={`Sharpe ${selectedCandidateScenarioComparison.idealCandidate.backtest.metrics.sharpe.toFixed(2)}`} tone="cyan" />
                    <DeepLedgerMiniStat label="可执行收益" value={formatPercent01V1(selectedCandidateScenarioComparison.executableCandidate.backtest.metrics.totalReturn)} hint={`Sharpe ${selectedCandidateScenarioComparison.executableCandidate.backtest.metrics.sharpe.toFixed(2)}`} tone="amber" />
                    <DeepLedgerMiniStat label="换手 / 调仓变化" value={`${formatSignedCurrencyV1(selectedCandidateScenarioComparison.turnoverDelta, baseCurrency)} / ${formatSignedIntegerV1(selectedCandidateScenarioComparison.rebalanceDelta)}`} hint={`Sharpe ${formatSignedNumberV1(-selectedCandidateScenarioComparison.sharpeGap)} · 可执行 ${formatCurrency(selectedCandidateScenarioComparison.executableCandidate.backtest.summary.turnoverNotional, baseCurrency)}`} tone={selectedCandidateScenarioComparison.turnoverDelta > 1 || selectedCandidateScenarioComparison.rebalanceDelta > 0 ? "amber" : selectedCandidateScenarioComparison.turnoverDelta < -1 || selectedCandidateScenarioComparison.rebalanceDelta < 0 ? "green" : "slate"} />
                  </div>

                  {selectedCandidateScenarioComparison.sourceBreakdown.length > 0 ? (
                    <div className="mt-4 rounded-[16px] border border-[var(--border)] bg-[rgba(5,10,18,0.55)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">执行折损来源拆解</div>
                          <div className="mt-1 text-xs text-[var(--muted)]">按“理想 → 费用 → 滑点 → 成交门槛 → 单次上限”逐层叠加，帮助定位主要折损来源；它更适合解释差异，不代表严格因果分摊。</div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {selectedCandidateScenarioComparison.sourceBreakdown.map((source) => {
                          const impactMeta = describeReturnImpactV1(source.returnImpact);
                          return (
                            <div key={source.sourceId} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.76)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{source.label}</div>
                                <DeepLedgerStatusPill tone={impactMeta.tone}>{impactMeta.label}</DeepLedgerStatusPill>
                              </div>
                              <div className="mt-3 font-[var(--font-mono)] text-[24px] text-[var(--text)]">{impactMeta.displayValue}</div>
                              <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{source.description}</div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[var(--muted)]">
                                <div>Sharpe {formatSignedNumberV1(-source.sharpeImpact)}</div>
                                <div>换手 {formatSignedCurrencyV1(source.turnoverDelta, baseCurrency)}</div>
                                <div>次数 {formatSignedIntegerV1(source.rebalanceDelta)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DeepLedgerMetricCard label="累计收益" value={formatPercent01V1(selectedCandidate.backtest.metrics.totalReturn)} subLabel={`相对 ${result.benchmark.symbol} 主动 ${formatPercent01V1(selectedCandidate.attribution.activeReturn)}`} accent="green" />
                <DeepLedgerMetricCard label="Sharpe" value={selectedCandidate.backtest.metrics.sharpe.toFixed(2)} subLabel={`胜率 ${formatPercent01V1(selectedCandidate.backtest.metrics.winRate)}`} accent="cyan" />
                <DeepLedgerMetricCard label="最大回撤" value={formatPercent01V1(selectedCandidate.backtest.metrics.maxDrawdown)} subLabel={`Calmar ${selectedCandidate.attribution.metrics.calmar.toFixed(2)}`} accent="amber" />
                <DeepLedgerMetricCard label="再平衡次数" value={`${selectedCandidate.backtest.summary.rebalanceCount}`} subLabel={`换手 ${formatCurrency(selectedCandidate.backtest.summary.turnoverNotional, baseCurrency)}`} accent="indigo" />
              </div>

              {resultReadiness ? (
                <div className="mt-5">
                  <DeepLedgerNoticeBox
                    tone={resultReadiness.tone}
                    title={resultReadiness.title}
                    description={resultReadiness.description}
                    icon={<AlertTriangle className="h-4 w-4" />}
                  >
                    <ul className="space-y-2 pl-4 text-sm text-[var(--muted)]">
                      {resultReadiness.items.map((item) => (
                        <li key={item} className="list-disc">{item}</li>
                      ))}
                    </ul>
                  </DeepLedgerNoticeBox>
                </div>
              ) : null}

              <div className="mt-5 space-y-4">
                <div className={deepLedgerTableShellClassName}>
                  <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text)]">
                    <Target className="h-4 w-4 text-[var(--primary)]" />
                    写回后会改哪些权重
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
                          <th className="px-4 py-3">资产</th>
                          <th className="px-4 py-3 text-right">当前</th>
                          <th className="px-4 py-3 text-right">候选</th>
                          <th className="px-4 py-3 text-right">变化</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDiffRows.length > 0 ? selectedDiffRows.map((row) => (
                          <tr key={row.symbol} className="border-t border-[var(--border)] text-[var(--muted)]">
                            <td className="px-4 py-3 font-medium text-[var(--text)]">{assetLabelByKey.get(row.symbol) || row.symbol}</td>
                            <td className="px-4 py-3 text-right">{formatPercent01V1(row.currentWeight)}</td>
                            <td className="px-4 py-3 text-right">{formatPercent01V1(row.nextWeight)}</td>
                            <td className="px-4 py-3 text-right" style={{ color: row.deltaWeight >= 0 ? "#34D399" : "#F59E0B" }}>
                              {row.deltaWeight >= 0 ? "+" : ""}{formatPercent01V1(row.deltaWeight)}
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--muted)]">当前目标已经与该候选一致，可直接写回确认。</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {warningSummary.length > 0 ? (
                  <DeepLedgerNoticeBox tone="red" title="警告与边界" description="这些问题会直接影响你对本轮结果的信心，建议先看这里，再决定是否写回。">
                    <ul className="space-y-2 pl-4 text-sm text-[var(--muted)]">
                      {warningSummary.slice(0, 8).map((warning) => (
                        <li key={warning} className="list-disc">{warning}</li>
                      ))}
                    </ul>
                  </DeepLedgerNoticeBox>
                ) : null}

                <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.55)] p-4">
                  <button
                    type="button"
                    onClick={() => setShowDeepAnalysis((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[var(--text)]">深入分析（次级）</div>
                      <div className="mt-1 text-xs leading-5 text-[var(--muted)]">只有在你需要解释收益来源、检查样本质量或查看调仓节奏时再展开，避免页面一次性塞满所有细节。</div>
                    </div>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm font-medium text-[var(--muted)]"
                    >
                      {showDeepAnalysis ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {showDeepAnalysis ? "收起" : "展开"}
                    </span>
                  </button>
                </div>

                {showDeepAnalysis ? (
                  <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <DeepLedgerNoticeBox tone="cyan" title="资产贡献" description="按绝对收益贡献排序，帮助判断收益来自哪里。" icon={<BarChart3 className="h-4 w-4" />}>
                          <div className="space-y-2">
                            {topContributors.length > 0 ? topContributors.map((row) => (
                              <div key={row.symbol} className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.55)] px-3 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-[var(--text)]">{assetLabelByKey.get(row.symbol) || row.symbol}</div>
                                  <div className="text-xs text-[var(--muted)]">平均权重 {formatPercent01V1(row.avgWeight)} · 资产收益 {formatPercent01V1(row.assetReturn)}</div>
                                </div>
                                <div className="text-sm font-semibold text-[var(--text)]">{formatPercent01V1(row.contributionToReturn)}</div>
                              </div>
                            )) : <div className="text-sm text-[var(--muted)]">暂无贡献数据</div>}
                          </div>
                        </DeepLedgerNoticeBox>

                        <div className={deepLedgerMonoPanelClassName}>
                          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
                            <Gauge className="h-4 w-4 text-[var(--amber)]" />
                            运行诊断
                          </div>
                          <div>输入资产 {result.diagnostics.inputSymbolCount} / 输出资产 {result.diagnostics.outputSymbolCount}</div>
                          <div>Union dates {result.diagnostics.unionDateCount} / Common dates {result.diagnostics.commonDateCount}</div>
                          <div>样本区间 {result.diagnostics.startDate || "-"} ~ {result.diagnostics.endDate || "-"}</div>
                          <div>基准 {result.benchmark.symbol} / 模式 {result.diagnostics.mode}</div>
                          <div>费用率 {selectedScenario?.execution.feeRateBps || 0} bps / 滑点 {selectedScenario?.execution.slippageBps || 0} bps / 时点 T+1 close</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <DeepLedgerNoticeBox tone="amber" title="再平衡事件" description="快速看调仓频率、换手和信号是否过于密集。" icon={<FlaskConical className="h-4 w-4" />}>
                        <div className="space-y-2">
                          {selectedCandidate.attribution.rebalanceEvents.length > 0 ? selectedCandidate.attribution.rebalanceEvents.slice(0, 8).map((event) => (
                            <div key={`${event.date}-${event.turnover}`} className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.55)] px-3 py-2">
                              <div>
                                <div className="text-sm font-semibold text-[var(--text)]">{event.date}</div>
                                <div className="text-xs text-[var(--muted)]">调仓前最大偏离 {formatPercent01V1(event.driftBefore, 2)}</div>
                              </div>
                              <div className="text-sm text-[var(--text)]">{formatCurrency(event.turnover, baseCurrency)}</div>
                            </div>
                          )) : <div className="text-sm text-[var(--muted)]">没有触发再平衡事件。</div>}
                        </div>
                      </DeepLedgerNoticeBox>
                    </div>
                  </div>
                ) : null}
              </div>
            </DeepLedgerPanel>
          ) : null}
        </>
      ) : (
        <DeepLedgerEmptyState
          title="还没有回测结果"
          description={selectedAssetCount <= 0 || selectedTargetSumPct <= 0
            ? "先准备研究资产，再给本轮实验填好 baseline 权重；策略实验室现在可以直接改实验权重，但不会自动改正式配置。"
            : "先选研究范围，再调组合风格，运行后会得到当前配置、单策略和组合候选，并支持把选中的目标权重写回工作台。"}
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              {selectedAssetCount <= 0 ? (
                <Link href="/daa/dashboard/workbench?tab=discovery" className={WORKBENCH_LINK_CLASSNAME_V1}>
                  去资产发现
                </Link>
              ) : null}
              {selectedAssetCount > 0 && selectedTargetSumPct <= 0 ? (
                <DeepLedgerActionButton tone="slate" onClick={() => setShowAssetPicker(true)}>
                  展开资产列表去设研究权重
                </DeepLedgerActionButton>
              ) : null}
              {selectedTargetSumPct <= 0 ? (
                <Link href="/daa/dashboard/workbench?tab=watchlist" className={WORKBENCH_LINK_CLASSNAME_V1}>
                  去观察列表看正式目标
                </Link>
              ) : null}
              <DeepLedgerActionButton tone="primary" onClick={() => void handleRun()} disabled={!canRun}>
                <FlaskConical className="h-4 w-4" />
                运行第一轮实验
              </DeepLedgerActionButton>
            </div>
          )}
        />
      )}
    </div>
  );
}
