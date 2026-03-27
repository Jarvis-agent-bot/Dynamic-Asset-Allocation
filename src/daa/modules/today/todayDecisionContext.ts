/**
 * todayDecisionContext.ts
 *
 * 将 workbench bootstrap 数据聚合为 /today 页面需要的决策上下文。
 * 纯函数，无副作用。
 */

import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";
import type { DecisionLogEntry, SignalSeatResult, TodayDecisionContext } from "./todayTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Signal seat builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 技术面席位：基于持仓的漂移和价格状态。
 * 当多数持仓价格新鲜且漂移小 → bullish（趋势稳定）
 * 当多数持仓漂移大 → bearish（偏离目标，需要关注）
 */
function buildTechnicalSeat(universe: WorkbenchBootstrap["assetUniverse"]): SignalSeatResult {
  const holdings = universe.filter((a) => a.holdingQty > 0);
  if (holdings.length === 0) {
    return { seat: "technical", stance: "neutral", confidence: 50, keyFactor: "无持仓" };
  }

  // 用价格新鲜度 + 漂移幅度综合判断
  let freshCount = 0;
  let totalDrift = 0;
  let maxDriftAsset = holdings[0];
  let maxDrift = 0;

  for (const h of holdings) {
    if (h.priceStatus === "fresh") freshCount++;
    const drift = Math.abs(h.gapPct ?? 0);
    totalDrift += drift;
    if (drift > maxDrift) {
      maxDrift = drift;
      maxDriftAsset = h;
    }
  }

  const avgDrift = totalDrift / holdings.length;
  const freshRatio = freshCount / holdings.length;

  // 漂移小且数据新鲜 → bullish；漂移大 → bearish
  const stance = avgDrift < 2 && freshRatio > 0.7 ? "bullish"
    : avgDrift > 5 ? "bearish"
    : "neutral";

  const confidence = Math.round(Math.min(100, freshRatio * 50 + (10 - Math.min(avgDrift, 10)) * 5));
  const driftDir = (maxDriftAsset.gapPct ?? 0) < 0 ? "超配" : "低配";

  return {
    seat: "technical",
    stance,
    confidence,
    keyFactor: maxDrift > 1
      ? `${maxDriftAsset.symbol} ${driftDir} ${maxDrift.toFixed(1)}% (均漂移 ${avgDrift.toFixed(1)}%)`
      : `持仓稳定 (均漂移 ${avgDrift.toFixed(1)}%)`,
  };
}

/** 估值席位：基于目标权重与实际权重的偏差 */
function buildValuationSeat(universe: WorkbenchBootstrap["assetUniverse"]): SignalSeatResult {
  const holdings = universe.filter((a) => a.holdingQty > 0 && a.targetWeightPct > 0);
  if (holdings.length === 0) {
    return { seat: "valuation", stance: "neutral", confidence: 50, keyFactor: "无目标配置" };
  }

  // 看有多少资产低于目标（偏低 = 潜在买入机会 = bullish）
  let underweightCount = 0;
  let overweightCount = 0;
  let maxGapAsset = holdings[0];
  let maxGapAbs = 0;

  for (const h of holdings) {
    const gap = h.targetWeightPct - h.actualWeightPct;
    if (gap > 1) underweightCount++;
    if (gap < -1) overweightCount++;
    if (Math.abs(gap) > maxGapAbs) {
      maxGapAbs = Math.abs(gap);
      maxGapAsset = h;
    }
  }

  const total = holdings.length;
  const stance = underweightCount > total * 0.5 ? "bullish" : overweightCount > total * 0.5 ? "bearish" : "neutral";
  const confidence = Math.round(Math.min(100, (Math.max(underweightCount, overweightCount) / total) * 80 + 20));
  const gapDir = (maxGapAsset.targetWeightPct - maxGapAsset.actualWeightPct) > 0 ? "低配" : "超配";
  const gapPct = Math.abs(maxGapAsset.targetWeightPct - maxGapAsset.actualWeightPct).toFixed(1);

  return {
    seat: "valuation",
    stance,
    confidence,
    keyFactor: `${maxGapAsset.symbol} ${gapDir} ${gapPct}%`,
  };
}

/** 新闻/宏观席位：基于市场环境 regime */
function buildNewsMacroSeat(marketContext: WorkbenchBootstrap["marketContext"]): SignalSeatResult {
  if (!marketContext) {
    return { seat: "news_macro", stance: "neutral", confidence: 30, keyFactor: "市场数据不可用" };
  }

  const regime = marketContext.regime;
  const stance = regime === "risk_on" ? "bullish" : regime === "risk_off" ? "bearish" : "neutral";
  const confidence = Math.round(marketContext.confidencePct);
  const topReason = marketContext.reasons[0] ?? "无具体原因";

  return {
    seat: "news_macro",
    stance,
    confidence,
    keyFactor: topReason,
  };
}

/**
 * 持仓行为席位：基于漂移幅度 + 历史决策一致性
 * - stance 由最大漂移幅度决定：>5% bearish, 2-5% neutral, <2% bullish
 * - confidence 由历史决策采纳率决定
 * - keyFactor 为最大漂移资产
 */
function buildPortfolioBehaviorSeat(
  universe: WorkbenchBootstrap["assetUniverse"],
  recentDecisions: DecisionLogEntry[],
): SignalSeatResult {
  const holdings = universe.filter((a) => a.holdingQty > 0);
  if (holdings.length === 0) {
    return { seat: "portfolio_behavior", stance: "neutral", confidence: 50, keyFactor: "无持仓" };
  }

  // 找最大漂移
  let maxDrift = 0;
  let maxDriftAsset = holdings[0];
  for (const h of holdings) {
    const drift = Math.abs(h.gapPct ?? 0);
    if (drift > maxDrift) {
      maxDrift = drift;
      maxDriftAsset = h;
    }
  }

  const stance = maxDrift > 5 ? "bearish" : maxDrift > 2 ? "neutral" : "bullish";

  // 决策一致性（近期采纳率 → 高 = 对当前配置有信心）
  const adopted = recentDecisions.filter((d) => d.userAction === "adopted").length;
  const total = recentDecisions.length;
  const adoptionRate = total > 0 ? adopted / total : 0.5;
  const confidence = Math.round(adoptionRate * 60 + 30); // 30-90 range

  const driftDir = (maxDriftAsset.gapPct ?? 0) < 0 ? "超配" : "低配";

  return {
    seat: "portfolio_behavior",
    stance,
    confidence,
    keyFactor: maxDrift > 0.5
      ? `${maxDriftAsset.symbol} ${driftDir} ${maxDrift.toFixed(1)}%`
      : "配置均衡",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main aggregation
// ─────────────────────────────────────────────────────────────────────────────

export function buildTodayDecisionContext(
  bootstrap: WorkbenchBootstrap,
  recentDecisions: DecisionLogEntry[],
): TodayDecisionContext {
  const holdings = bootstrap.assetUniverse.filter((a) => a.holdingQty > 0);
  const totalEquity = bootstrap.account.totalEquity ?? 0;
  const cashRatio = totalEquity > 0 ? bootstrap.account.cash / totalEquity : 1;

  // 简单 HHI 计算
  let hhi = 0;
  for (const h of holdings) {
    const w = h.actualWeightPct / 100;
    hhi += w * w;
  }
  hhi = Math.round(hhi * 10000);

  const concentrationLevel =
    hhi < 1500 ? "充分分散" : hhi < 2500 ? "适度分散" : hhi < 5000 ? "中度集中" : "高度集中";

  return {
    portfolioState: {
      totalEquity,
      positions: holdings.map((h) => ({
        assetKey: h.assetKey,
        symbol: h.symbol,
        weight: h.actualWeightPct,
        drift: h.gapPct ?? 0,
        holdingQty: h.holdingQty,
      })),
      cashRatio,
      availableCash: bootstrap.account.investableCash,
    },
    signalSeats: [
      buildTechnicalSeat(bootstrap.assetUniverse),
      buildValuationSeat(bootstrap.assetUniverse),
      buildNewsMacroSeat(bootstrap.marketContext),
      buildPortfolioBehaviorSeat(bootstrap.assetUniverse, recentDecisions),
    ],
    riskConstraints: {
      maxSinglePosition: Math.max(...holdings.map((h) => h.actualWeightPct), 0),
      hhi,
      concentrationLevel,
      currentRegime: bootstrap.marketContext?.regime ?? "unknown",
    },
    recentDecisions: recentDecisions.slice(0, 10).map((d) => ({
      assetKey: d.assetKey,
      action: d.userAction,
      outcome: d.outcomeResult ? JSON.stringify(d.outcomeResult) : null,
      daysAgo: Math.round((Date.now() - new Date(d.createdAt).getTime()) / 86400000),
    })),
    generatedAt: new Date().toISOString(),
  };
}
