/**
 * Trade Outcome Feedback — 投资判断 → 调仓 闭环反馈
 *
 * 交易结果反馈会沉淀为判断依据，形成 thesis → proposal → trade → evidence 闭环。
 *
 * 逻辑：
 * 1. 计算 PnL 方向是否符合投资判断 conviction
 * 2. 创建 EvidenceItem（source: "trade_outcome"）
 * 3. 高 conviction 投资判断出现大幅亏损时，自动安排提前 review
 */

import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

/** 亏损阈值（PnL% 低于此值 + 高 conviction 时触发 urgent review） */
const URGENT_REVIEW_LOSS_THRESHOLD = -0.10; // -10%

interface TradeOutcomeInput {
  thesisId: string;
  assetKey: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  currentPrice: number;
  /** 已实现 PnL %（null 表示尚未平仓，用 unrealized 计算） */
  realizedPnlPct: number | null;
}

interface TradeOutcomeResult {
  evidenceAdded: boolean;
  urgentReviewScheduled: boolean;
  evidenceType: "supporting" | "contradicting" | "neutral";
}

/**
 * 记录交易结果为判断依据，并在必要时安排紧急复盘。
 */
export async function recordTradeOutcomeAsEvidence(input: TradeOutcomeInput): Promise<TradeOutcomeResult> {
  const result: TradeOutcomeResult = {
    evidenceAdded: false,
    urgentReviewScheduled: false,
    evidenceType: "neutral",
  };

  try {
    const thesis = await thesisStore.getThesisById(input.thesisId);
    if (!thesis || thesis.status !== "active") return result;

    // 计算 PnL（BUY: 价涨=正, SELL: 价跌=正）
    const rawPnlPct = input.realizedPnlPct ?? (input.currentPrice - input.entryPrice) / input.entryPrice;
    // 对 SELL 方向：价格下跌对卖方有利，反转 PnL 方向
    const effectivePnlPct = input.side === "SELL" ? -rawPnlPct : rawPnlPct;
    const isProfit = effectivePnlPct > 0;

    // 判断投资判断 conviction 方向（high/medium 视为看多，low 视为看空/减仓）
    const thesisBullish = thesis.conviction === "high" || thesis.conviction === "medium";
    const tradeBullish = input.side === "BUY";

    // evidence type 判定
    // BUY + 看多 + 盈利 → supporting; BUY + 看多 + 亏损 → contradicting
    // SELL + 看空 + 价跌(盈利) → supporting; SELL + 看空 + 价涨(亏损) → contradicting
    if (tradeBullish === thesisBullish) {
      // 交易方向与 thesis 一致
      result.evidenceType = isProfit ? "supporting" : "contradicting";
    } else {
      // 交易方向与 thesis 不一致（如看多但卖出），中性处理
      result.evidenceType = "neutral";
    }

    // 生成描述
    const pnlStr = (effectivePnlPct * 100).toFixed(1);
    const content = `交易反馈: ${input.side} ${input.assetKey} ` +
      `入场 $${input.entryPrice.toFixed(2)} → 现价 $${input.currentPrice.toFixed(2)} ` +
      `(${isProfit ? "+" : ""}${pnlStr}%)。` +
      `投资判断 conviction=${thesis.conviction}，${result.evidenceType === "supporting" ? "方向一致" : result.evidenceType === "contradicting" ? "方向不一致" : "中性"}。`;

    // 添加 evidence
    await thesisStore.addEvidence({
      threadId: input.thesisId,
      evidenceType: result.evidenceType,
      source: "trade_outcome",
      content,
      dataSnapshot: {
        assetKey: input.assetKey,
        side: input.side,
        entryPrice: input.entryPrice,
        currentPrice: input.currentPrice,
        pnlPct: effectivePnlPct,
        conviction: thesis.conviction,
      },
    });
    result.evidenceAdded = true;

    // 高 conviction 投资判断 + 大幅亏损 → 安排提前 review
    if (
      result.evidenceType === "contradicting" &&
      thesis.conviction === "high" &&
      effectivePnlPct < URGENT_REVIEW_LOSS_THRESHOLD
    ) {
      // 将 reviewAt 设为 1 天后（urgent review）
      const urgentReviewAt = new Date(Date.now() + 1 * 86400000);
      const currentReviewAt = thesis.reviewAt ? new Date(thesis.reviewAt) : null;

      // 只在新日期更早时更新
      if (!currentReviewAt || urgentReviewAt < currentReviewAt) {
        await thesisStore.updateThesis(input.thesisId, { reviewAt: urgentReviewAt });
        result.urgentReviewScheduled = true;
      }
    }

    return result;
  } catch (e) {
    logSwallowed("tradeOutcomeFeedback.recordEvidence", e);
    return result;
  }
}
