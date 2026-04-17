/**
 * Watchlist Entry Service — 信号驱动的自动建仓提案生成。
 *
 * 流程：
 *   1) 读取启用自动建仓的 watchlist 条目（holdingQty == 0 且过冷静期）
 *   2) 并行计算技术 + 估值信号，按每资产规则或全局默认规则判定达标
 *   3) 根据 entryTargetWeightPct 与可用现金上限生成 BUY 提案
 *   4) 按融合评分排序，截取 maxPerCycle 条
 *
 * 注入点：generateWorkbenchRebalanceCycle 的 draft.proposals 合并前。
 */

import { clamp } from "@/src/core/math";
import { buildTechnicalSignalForSymbol, type DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";
import { buildValuationSignalForSymbol } from "@/src/daa/signals/valuationSignal";
import type { DaaValuationSignal } from "@/src/daa/signals/valuationSignal";
import { listActiveWatchlistAutoEntries, type WatchlistAutoEntryRow, type WatchlistEntryRulesOverride } from "@/src/daa/store/watchlistAutoEntryStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { AssetUniverseView, RebalanceProposal, WorkbenchBootstrap } from "./workbenchTypes";

export type WatchlistEntryEvaluation = {
  assetKey: string;
  symbol: string;
  eligible: boolean;
  technicalScore: number | null;
  valuationScore: number | null;
  fusionScore: number | null;
  rejectReason: string | null;
};

export type GenerateWatchlistEntryProposalsResult = {
  proposals: RebalanceProposal[];
  evaluations: WatchlistEntryEvaluation[];
};

function effectiveRules(
  override: WatchlistEntryRulesOverride | null,
  defaults: DaaSystemConfig["watchlistEntry"] extends infer T ? T extends { defaultRules: infer R } ? R : never : never,
): { minTechnicalScore: number; minValuationScore: number; minFusionScore: number; requireStrongMomentum: boolean } {
  return {
    minTechnicalScore: override?.minTechnicalScore ?? defaults.minTechnicalScore,
    minValuationScore: override?.minValuationScore ?? defaults.minValuationScore,
    minFusionScore: override?.minFusionScore ?? defaults.minFusionScore,
    requireStrongMomentum: override?.requireStrongMomentum ?? defaults.requireStrongMomentum,
  };
}

function fuseScore(tech: DaaTechnicalSignal | null, val: DaaValuationSignal | null): number | null {
  const parts: number[] = [];
  if (tech) parts.push(tech.scorePct);
  if (val) parts.push(val.scorePct);
  if (parts.length === 0) return null;
  // 等权平均（技术 + 估值），新闻信号在自动建仓场景留待未来
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function isPastCooldown(row: WatchlistAutoEntryRow): boolean {
  if (!row.lastEntryTriggeredAt) return true;
  const lastMs = Date.parse(row.lastEntryTriggeredAt);
  if (!Number.isFinite(lastMs)) return true;
  const cooldownMs = Math.max(1, row.entryCooldownDays) * 24 * 60 * 60 * 1000;
  return Date.now() - lastMs >= cooldownMs;
}

export async function generateWatchlistEntryProposals(input: {
  bootstrap: WorkbenchBootstrap;
  systemConfig: DaaSystemConfig;
}): Promise<GenerateWatchlistEntryProposalsResult> {
  const empty: GenerateWatchlistEntryProposalsResult = { proposals: [], evaluations: [] };
  const cfg = input.systemConfig.watchlistEntry;
  if (!cfg?.enabled) return empty;

  let candidates: WatchlistAutoEntryRow[] = [];
  try {
    candidates = await listActiveWatchlistAutoEntries();
  } catch (err) {
    logSwallowed("watchlistEntry.listCandidates", err);
    return empty;
  }
  if (candidates.length === 0) return empty;

  // Asset universe 映射（用于取价、FX、持仓状态）
  const universeMap = new Map<string, AssetUniverseView>();
  for (const row of input.bootstrap.assetUniverse) {
    universeMap.set(row.assetKey.toUpperCase(), row);
  }

  const totalEquity = Math.max(0, input.bootstrap.account.totalEquity ?? 0);
  const availableCash = Math.max(0, input.bootstrap.account.investableCash ?? 0);
  if (!(totalEquity > 0) || !(availableCash > 0)) return empty;

  const cashBudget = availableCash * clamp(cfg.notionalCashCapPct, 0.05, 1.0);
  const evaluations: WatchlistEntryEvaluation[] = [];

  // Phase 1: 过滤出待评估候选（未持仓、过冷静期、有目标权重、价格可用）
  const eligible: Array<{ row: WatchlistAutoEntryRow; asset: AssetUniverseView }> = [];
  for (const row of candidates) {
    const asset = universeMap.get(row.assetKey.toUpperCase());
    if (!asset) {
      evaluations.push({ assetKey: row.assetKey, symbol: row.assetKey, eligible: false, technicalScore: null, valuationScore: null, fusionScore: null, rejectReason: "资产不在当前 universe" });
      continue;
    }
    if (asset.holdingQty > 0) {
      evaluations.push({ assetKey: row.assetKey, symbol: asset.symbol, eligible: false, technicalScore: null, valuationScore: null, fusionScore: null, rejectReason: "已有持仓，跳过自动建仓" });
      continue;
    }
    if (!isPastCooldown(row)) {
      evaluations.push({ assetKey: row.assetKey, symbol: asset.symbol, eligible: false, technicalScore: null, valuationScore: null, fusionScore: null, rejectReason: `冷静期未过（${row.entryCooldownDays}天）` });
      continue;
    }
    const targetPct = row.entryTargetWeightPct;
    if (!targetPct || !(targetPct > 0)) {
      evaluations.push({ assetKey: row.assetKey, symbol: asset.symbol, eligible: false, technicalScore: null, valuationScore: null, fusionScore: null, rejectReason: "未设置目标权重" });
      continue;
    }
    const price = asset.lastPrice > 0 ? asset.lastPrice : asset.holdingPrice;
    if (!(price > 0) || asset.fxMissing) {
      evaluations.push({ assetKey: row.assetKey, symbol: asset.symbol, eligible: false, technicalScore: null, valuationScore: null, fusionScore: null, rejectReason: "缺少价格或汇率" });
      continue;
    }
    eligible.push({ row, asset });
  }

  if (eligible.length === 0) return { proposals: [], evaluations };

  // Phase 2: 并行跑技术 + 估值信号（失败单项不影响整体）
  const signalResults = await Promise.allSettled(
    eligible.map(async ({ asset }) => {
      const [tech, val] = await Promise.allSettled([
        buildTechnicalSignalForSymbol(asset.symbol),
        buildValuationSignalForSymbol(asset.symbol),
      ]);
      return {
        tech: tech.status === "fulfilled" ? tech.value : null,
        val: val.status === "fulfilled" ? val.value : null,
      };
    }),
  );

  type Candidate = { row: WatchlistAutoEntryRow; asset: AssetUniverseView; tech: DaaTechnicalSignal | null; val: DaaValuationSignal | null; fusion: number | null };
  const scored: Candidate[] = [];

  // Phase 3: 逐个应用规则 + 记录评估
  for (let i = 0; i < eligible.length; i += 1) {
    const { row, asset } = eligible[i];
    const result = signalResults[i];
    const tech = result.status === "fulfilled" ? result.value.tech : null;
    const val = result.status === "fulfilled" ? result.value.val : null;
    const fusion = fuseScore(tech, val);
    const rules = effectiveRules(row.entryRules, cfg.defaultRules);

    let reject: string | null = null;
    if (!tech || !val) {
      reject = `信号数据不完整 (tech=${tech ? "ok" : "miss"}, val=${val ? "ok" : "miss"})`;
    } else if (tech.scorePct < rules.minTechnicalScore) {
      reject = `技术评分 ${tech.scorePct.toFixed(1)} < 阈值 ${rules.minTechnicalScore}`;
    } else if (val.scorePct < rules.minValuationScore) {
      reject = `估值评分 ${val.scorePct.toFixed(1)} < 阈值 ${rules.minValuationScore}`;
    } else if (fusion != null && fusion < rules.minFusionScore) {
      reject = `融合评分 ${fusion.toFixed(1)} < 阈值 ${rules.minFusionScore}`;
    } else if (rules.requireStrongMomentum && tech.momentumRegime !== "strong") {
      reject = `要求强动量但当前 momentumRegime=${tech.momentumRegime}`;
    }

    evaluations.push({
      assetKey: row.assetKey,
      symbol: asset.symbol,
      eligible: reject == null,
      technicalScore: tech?.scorePct ?? null,
      valuationScore: val?.scorePct ?? null,
      fusionScore: fusion,
      rejectReason: reject,
    });

    if (reject == null) {
      scored.push({ row, asset, tech, val, fusion });
    }
  }

  if (scored.length === 0) return { proposals: [], evaluations };

  // Phase 4: 按融合分排序，截取 maxPerCycle 并分配现金
  scored.sort((a, b) => (b.fusion ?? 0) - (a.fusion ?? 0));
  const topN = scored.slice(0, Math.max(1, cfg.maxPerCycle));

  const proposals: RebalanceProposal[] = [];
  let cashUsed = 0;
  for (const { row, asset, tech, val, fusion } of topN) {
    const targetPct = (row.entryTargetWeightPct ?? 0) / 100;
    if (!(targetPct > 0)) continue;
    const targetNotional = targetPct * totalEquity;
    const remainingCash = Math.max(0, cashBudget - cashUsed);
    if (remainingCash <= 0) break;
    const baseNotional = Math.min(targetNotional, remainingCash);
    if (!(baseNotional > 0)) continue;
    const price = asset.lastPrice > 0 ? asset.lastPrice : asset.holdingPrice;
    if (!(price > 0)) continue;

    const fxRateToBase = asset.fxRateToBase && asset.fxRateToBase > 0 ? asset.fxRateToBase : null;
    const localNotional = fxRateToBase ? baseNotional / fxRateToBase : baseNotional;
    const suggestedQty = localNotional / price;
    if (!(suggestedQty > 0)) continue;

    const reason = [
      "[自动建仓]",
      tech ? `tech=${tech.scorePct.toFixed(0)}` : "tech=-",
      val ? `val=${val.scorePct.toFixed(0)}` : "val=-",
      fusion != null ? `fusion=${fusion.toFixed(0)}` : "fusion=-",
      `目标 ${(targetPct * 100).toFixed(1)}%`,
    ].join(" ");

    proposals.push({
      assetKey: asset.assetKey,
      symbol: asset.symbol,
      currency: asset.currency,
      fxRateToBase,
      side: "BUY",
      suggestedQty,
      suggestedNotional: baseNotional,
      price,
      reason,
      selected: true,
      hfContribution: asset.hfSignal ? `${asset.hfSignal.icon} ${asset.hfSignal.label}` : null,
      proposalType: "watchlist_entry",
    });
    cashUsed += baseNotional;
  }

  return { proposals, evaluations };
}
