/**
 * todayDecisionContext.ts
 *
 * 将 workbench bootstrap 数据聚合为 /today 页面需要的决策上下文。
 * 纯函数，无副作用。
 *
 * 四个信号席位各自负责独立维度：
 *   技术面 — 价格趋势和动量（价格方向 + 数据新鲜度）
 *   估值   — 目标权重偏离分布（超配/低配的资产占比）
 *   新闻/宏观 — 市场环境体制（risk_on / risk_off / transitional）
 *   持仓行为 — 组合集中度 + 历史决策一致性
 */

import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";
import type { DecisionLogEntry, SignalSeatResult, SignalStance, TodayDecisionContext } from "./todayTypes";

/** 将数值限制在合理范围内 */
function clampPct(v: number | null | undefined, min = -100, max = 100): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(min, Math.min(max, v));
}

/** 置信度低于门槛时降级为 neutral */
function applyConfidenceGate(seat: SignalSeatResult, threshold = 25): SignalSeatResult {
  if (seat.confidence < threshold && seat.stance !== "neutral") {
    return { ...seat, stance: "neutral", keyFactor: `${seat.keyFactor}（置信度不足）` };
  }
  return seat;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal seat builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 技术面席位：数据可用性 + 价格趋势信号。
 * 用价格新鲜度 + 持仓价格相对成本的盈亏方向综合判断。
 * - 多数持仓有新鲜价格且浮盈 → bullish
 * - 多数持仓浮亏或数据缺失 → bearish
 * - 混合 → neutral
 */
function buildTechnicalSeat(universe: WorkbenchBootstrap["assetUniverse"]): SignalSeatResult {
  const holdings = universe.filter((a) => a.holdingQty > 0);
  if (holdings.length === 0) {
    return { seat: "portfolio_momentum", stance: "neutral", confidence: 50, keyFactor: "无持仓" };
  }

  let freshCount = 0;
  let profitCount = 0;
  let lossCount = 0;
  let biggestPnlAsset = holdings[0];
  let biggestPnlPct = 0;

  for (const h of holdings) {
    if (h.priceStatus === "fresh") freshCount++;
    // 用 lastPrice vs holdingPrice 判断盈亏方向
    if (h.lastPrice > 0 && h.holdingPrice > 0) {
      const pnlPct = ((h.lastPrice - h.holdingPrice) / h.holdingPrice) * 100;
      if (pnlPct > 1) profitCount++;
      else if (pnlPct < -1) lossCount++;
      if (Math.abs(pnlPct) > Math.abs(biggestPnlPct)) {
        biggestPnlPct = pnlPct;
        biggestPnlAsset = h;
      }
    }
  }

  const freshRatio = freshCount / holdings.length;
  const total = holdings.length;

  // 数据不够新鲜时降低置信度
  if (freshRatio < 0.3) {
    return applyConfidenceGate({
      seat: "portfolio_momentum",
      stance: "neutral",
      confidence: Math.round(freshRatio * 30),
      keyFactor: `${holdings.length} 个持仓中仅 ${freshCount} 个有最新价格`,
    });
  }

  const profitRatio = profitCount / total;
  const lossRatio = lossCount / total;
  const stance: SignalStance = profitRatio > 0.6 ? "bullish" : lossRatio > 0.6 ? "bearish" : "neutral";
  const confidence = Math.round(Math.max(profitRatio, lossRatio) * 60 + freshRatio * 30);

  const pnlDir = biggestPnlPct >= 0 ? "浮盈" : "浮亏";
  const pnlAbs = Math.abs(biggestPnlPct).toFixed(1);

  return applyConfidenceGate({
    seat: "portfolio_momentum",
    stance,
    confidence: Math.min(100, confidence),
    keyFactor: Math.abs(biggestPnlPct) > 1
      ? `${biggestPnlAsset.symbol} ${pnlDir} ${pnlAbs}%，${profitCount} 盈 ${lossCount} 亏`
      : `持仓整体盈亏平缓，${profitCount} 盈 ${lossCount} 亏`,
  });
}

/**
 * 估值席位：目标权重偏离分布。
 * 看有多少资产偏离目标权重，以及偏离方向。
 * - 多数低配（有买入空间）→ bullish
 * - 多数超配（需要减持）→ bearish
 * - 均衡 → neutral
 */
function buildValuationSeat(universe: WorkbenchBootstrap["assetUniverse"]): SignalSeatResult {
  const withTarget = universe.filter((a) => a.targetWeightPct > 0);
  if (withTarget.length === 0) {
    return { seat: "allocation_drift", stance: "neutral", confidence: 50, keyFactor: "无目标配置" };
  }

  let underweightCount = 0;
  let overweightCount = 0;
  let maxGapAsset = withTarget[0];
  let maxGapAbs = 0;

  for (const h of withTarget) {
    const gap = h.targetWeightPct - h.actualWeightPct;
    if (gap > 2) underweightCount++;
    if (gap < -2) overweightCount++;
    if (Math.abs(gap) > maxGapAbs) {
      maxGapAbs = Math.abs(gap);
      maxGapAsset = h;
    }
  }

  const total = withTarget.length;
  const stance: SignalStance = underweightCount > total * 0.5
    ? "bullish"
    : overweightCount > total * 0.5
      ? "bearish"
      : "neutral";
  const dominantCount = Math.max(underweightCount, overweightCount);
  const confidence = Math.round(Math.min(100, (dominantCount / total) * 70 + 25));
  const gapDir = (maxGapAsset.targetWeightPct - maxGapAsset.actualWeightPct) > 0 ? "低配" : "超配";
  const gapPct = maxGapAbs.toFixed(1);

  return applyConfidenceGate({
    seat: "allocation_drift",
    stance,
    confidence,
    keyFactor: `${overweightCount} 项超配、${underweightCount} 项低配，${maxGapAsset.symbol} ${gapDir} ${gapPct}%`,
  });
}

/** 新闻/宏观席位：基于市场环境 regime */
function buildNewsMacroSeat(marketContext: WorkbenchBootstrap["marketContext"]): SignalSeatResult {
  if (!marketContext) {
    return { seat: "news_macro", stance: "neutral", confidence: 30, keyFactor: "市场数据不可用" };
  }

  const regime = marketContext.regime;
  const stance: SignalStance = regime === "risk_on" ? "bullish" : regime === "risk_off" ? "bearish" : "neutral";
  const confidence = Math.round(marketContext.confidencePct);
  const topReason = marketContext.reasons[0] ?? "无具体原因";

  return applyConfidenceGate({
    seat: "news_macro",
    stance,
    confidence,
    keyFactor: topReason,
  });
}

/**
 * 持仓行为席位：组合集中度 + 历史决策一致性。
 * 不再使用漂移数据（已由估值席位覆盖）。
 * - HHI 低 + 历史采纳率高 → bullish（组合健康且决策一致）
 * - HHI 高（集中度风险）→ bearish
 * - 历史采纳率低 → neutral（决策犹豫不决）
 */
function buildPortfolioBehaviorSeat(
  universe: WorkbenchBootstrap["assetUniverse"],
  recentDecisions: DecisionLogEntry[],
): SignalSeatResult {
  const holdings = universe.filter((a) => a.holdingQty > 0);
  if (holdings.length === 0) {
    return { seat: "portfolio_behavior", stance: "neutral", confidence: 50, keyFactor: "无持仓" };
  }

  // HHI 集中度
  let hhi = 0;
  let maxWeightAsset = holdings[0];
  for (const h of holdings) {
    const w = h.actualWeightPct / 100;
    hhi += w * w;
    if (h.actualWeightPct > (maxWeightAsset.actualWeightPct)) {
      maxWeightAsset = h;
    }
  }

  // 决策一致性
  const adopted = recentDecisions.filter((d) => d.userAction === "adopted").length;
  const total = recentDecisions.length;
  const adoptionRate = total > 0 ? adopted / total : 0.5;

  // HHI > 0.25 高集中 → bearish, < 0.15 分散 → bullish
  const concentrationStance: SignalStance = hhi >= 0.25 ? "bearish" : hhi < 0.15 ? "bullish" : "neutral";
  // 采纳率高 → 决策一致 → 偏 bullish 修正
  const finalStance: SignalStance = concentrationStance === "neutral" && adoptionRate > 0.7
    ? "bullish"
    : concentrationStance;

  const confidence = Math.round(
    (concentrationStance !== "neutral" ? 50 : 30) + adoptionRate * 30 + (1 - Math.min(hhi, 0.5) * 2) * 20,
  );

  const hhiLabel = hhi >= 0.25 ? "高度集中" : hhi >= 0.15 ? "中度集中" : "适度分散";
  const decisionLabel = total > 0
    ? `近期 ${total} 次决策中采纳 ${adopted} 次`
    : "暂无历史决策";

  return applyConfidenceGate({
    seat: "portfolio_behavior",
    stance: finalStance,
    confidence: Math.min(100, confidence),
    keyFactor: `${hhiLabel}（最大 ${maxWeightAsset.symbol} ${maxWeightAsset.actualWeightPct.toFixed(0)}%），${decisionLabel}`,
  });
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
        drift: clampPct(h.gapPct),
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
