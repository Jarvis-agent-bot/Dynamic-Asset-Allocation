/**
 * todayTypes.ts
 *
 * /today 投委会 OS — 核心类型定义
 *
 * 四个信号席位各自给出结构化结论，LLM 负责归纳分歧、行动建议、指出缺失。
 */

// ─────────────────────────────────────────────────────────────────────────────
// Signal Seats
// ─────────────────────────────────────────────────────────────────────────────

export type SignalSeatId = "technical" | "valuation" | "news_macro" | "portfolio_behavior";

export type SignalStance = "bullish" | "neutral" | "bearish";

export type SignalSeatResult = {
  seat: SignalSeatId;
  stance: SignalStance;
  /** 0-100 */
  confidence: number;
  /** 简短关键因子描述 */
  keyFactor: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// LLM Decision Context (input)
// ─────────────────────────────────────────────────────────────────────────────

export type TodayDecisionContext = {
  portfolioState: {
    totalEquity: number;
    positions: Array<{
      assetKey: string;
      symbol: string;
      weight: number;
      drift: number;
      holdingQty: number;
    }>;
    cashRatio: number;
    availableCash: number;
  };
  signalSeats: SignalSeatResult[];
  riskConstraints: {
    maxSinglePosition: number;
    hhi: number;
    concentrationLevel: string;
    currentRegime: string;
  };
  recentDecisions: Array<{
    assetKey: string;
    action: string;
    outcome: string | null;
    daysAgo: number;
  }>;
  /** ISO timestamp */
  generatedAt: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// LLM Decision Output
// ─────────────────────────────────────────────────────────────────────────────

export type TodayConclusion = "act" | "watch" | "hold";

export type TodayActionItem = {
  assetKey: string;
  suggestedAction: string;
  rationale: string;
  /** 0-100 */
  confidence: number;
};

export type TodayLlmOutput = {
  status: "ok" | "cached" | "degraded" | "error";
  conclusion: TodayConclusion;
  /** 最多 2 句话 */
  reason: string;
  /** 反方观点 */
  dissent: string;
  /** 风险提示 */
  riskWarning: string;
  /** 缺失信息 */
  missingInfo: string;
  /** 仅在 conclusion === 'act' 时返回 */
  actionItems?: TodayActionItem[];
  /** ISO timestamp */
  generatedAt: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Decision Log (user actions)
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionUserAction = "adopted" | "ignored" | "deferred";

export type DecisionLogEntry = {
  id: number;
  accountId: string;
  createdAt: string;
  assetKey: string;
  conclusion: TodayConclusion;
  userAction: DecisionUserAction;
  llmReason: string | null;
  signalSnapshot: Record<string, unknown> | null;
  outcomeCheckedAt: string | null;
  outcomeResult: Record<string, unknown> | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Today Read Model (API response)
// ─────────────────────────────────────────────────────────────────────────────

export type TodayReadModel = {
  decisionContext: TodayDecisionContext;
  llmOutput: TodayLlmOutput;
  portfolioHealth: {
    totalEquity: number;
    equityDeltaDay: number | null;
    equityDeltaDayPct: number | null;
    hhi: number;
    concentrationLevel: string;
    maxDrawdown: number | null;
  };
  recentDecisions: DecisionLogEntry[];
  cachedAt: string | null;
  isStale: boolean;
};
