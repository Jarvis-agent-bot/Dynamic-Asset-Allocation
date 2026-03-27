/**
 * decisionOutcomeService.ts
 *
 * 决策后验服务：检查历史决策的实际市场结果。
 *
 * 决策飞轮：
 * 用户决策(采纳/忽略) → 记录到 decision_log
 *   → 次日 cron 检查后验结果 → 写入 outcome_result
 *   → 统计各席位准确率 → 反馈给 LLM 作为 historical_decisions
 */

import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { listUncheckedDecisions, updateDecisionOutcome } from "@/src/daa/store/todayStore";
import { batchReadAssetPriceSnapshots } from "@/src/daa/store/assetUniverseStore";

export type OutcomeCheckResult = {
  checked: number;
  updated: number;
  errors: number;
};

/**
 * 检查 1-7 天前的未后验决策，对比当前市场价格。
 *
 * 后验逻辑：
 * - 对于 "adopted" 的 act 建议：如果价格朝建议方向移动 → positive
 * - 对于 "ignored" 的 act 建议：如果价格朝建议方向移动 → missed_opportunity
 * - 对于 "adopted" 的 watch/hold：如果市场稳定 → correct_hold
 */
export async function checkDecisionOutcomes(): Promise<OutcomeCheckResult> {
  const unchecked = await listUncheckedDecisions(1, 7);
  let checked = 0;
  let updated = 0;
  let errors = 0;

  // 批量获取所有涉及资产的当前价格
  const assetKeys = [...new Set(unchecked.map((d) => d.assetKey))];
  const priceSnapshots = await batchReadAssetPriceSnapshots(assetKeys);
  const priceMap = new Map(priceSnapshots.map((p) => [p.assetKey, p.lastPrice]));

  for (const decision of unchecked) {
    checked++;
    try {
      // 获取决策时的价格快照
      const snapshot = decision.signalSnapshot as Record<string, unknown> | null;
      const priceAtDecision = snapshot?.priceAtDecision as number | undefined;

      // 获取当前价格
      const currentPrice = priceMap.get(decision.assetKey) ?? null;

      if (currentPrice == null || priceAtDecision == null || priceAtDecision === 0) {
        // 无法后验（没有价格数据），标记为 insufficient_data
        await updateDecisionOutcome(decision.id, {
          status: "insufficient_data",
          reason: "缺少价格数据用于后验",
          checkedAt: new Date().toISOString(),
        });
        updated++;
        continue;
      }

      const priceChangePct = ((currentPrice - priceAtDecision) / priceAtDecision) * 100;
      const direction = priceChangePct > 0 ? "up" : priceChangePct < 0 ? "down" : "flat";

      let verdict: string;
      if (decision.conclusion === "act") {
        if (decision.userAction === "adopted") {
          // 用户采纳了 act 建议
          verdict = Math.abs(priceChangePct) > 1 ? "actionable_move" : "minimal_change";
        } else {
          // 用户忽略了 act 建议
          verdict = Math.abs(priceChangePct) > 2 ? "missed_opportunity" : "correct_skip";
        }
      } else {
        // watch/hold 决策
        verdict = Math.abs(priceChangePct) < 3 ? "correct_hold" : "unexpected_move";
      }

      await updateDecisionOutcome(decision.id, {
        status: "checked",
        priceAtDecision,
        currentPrice,
        priceChangePct: Math.round(priceChangePct * 100) / 100,
        direction,
        verdict,
        daysElapsed: Math.round((Date.now() - new Date(decision.createdAt).getTime()) / 86400000),
        checkedAt: new Date().toISOString(),
      });
      updated++;
    } catch (err) {
      logSwallowed(`decisionOutcomeService.check[${decision.id}]`, err);
      errors++;
    }
  }

  return { checked, updated, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision stats
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionStats = {
  totalDecisions: number;
  adopted: number;
  ignored: number;
  deferred: number;
  outcomeChecked: number;
  verdictBreakdown: Record<string, number>;
};

export function computeDecisionStats(
  decisions: Array<{
    userAction: string;
    outcomeResult: Record<string, unknown> | null;
  }>,
): DecisionStats {
  const stats: DecisionStats = {
    totalDecisions: decisions.length,
    adopted: 0,
    ignored: 0,
    deferred: 0,
    outcomeChecked: 0,
    verdictBreakdown: {},
  };

  for (const d of decisions) {
    if (d.userAction === "adopted") stats.adopted++;
    else if (d.userAction === "ignored") stats.ignored++;
    else stats.deferred++;

    if (d.outcomeResult) {
      stats.outcomeChecked++;
      const verdict = String(d.outcomeResult.verdict ?? "unknown");
      stats.verdictBreakdown[verdict] = (stats.verdictBreakdown[verdict] ?? 0) + 1;
    }
  }

  return stats;
}
