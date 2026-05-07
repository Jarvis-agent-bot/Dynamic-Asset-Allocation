/**
 * Cognitive Agent — LangGraph 状态定义
 */

import { Annotation } from "@langchain/langgraph";
import type {
  ResearchThread,
  InvestigationTarget,
  NewThreadSuggestion,
  Surprise,
  ReasoningTrace,
  ToolCallRecord,
  InvestigateOutput,
  DailyBriefing,
  AgentMemory,
} from "@/src/daa/agent/cognitiveTypes";

// 简化的市场快照（从现有数据读取）
export interface MarketSnapshot {
  regime: string; // risk_on / risk_off / transitional
  vix: number | null;
  indicators: Record<string, unknown>;
}

export interface PortfolioSnapshot {
  holdings: Array<{
    assetKey: string;
    symbol: string;
    holdingQty: number;
    lastPrice: number;
    /** 基准货币估值，用于跨市场展示和权重计算，避免把 HKD/CNY 原币种金额当 USD 相加。 */
    valuationBase?: number | null;
    weightPct: number;
    unrealizedPnlPct: number | null;
  }>;
  totalEquity: number;
  cashPct: number;
}

export interface WatchlistSnapshot {
  candidates: Array<{
    assetKey: string;
    symbol: string;
    lastPrice: number;
    targetWeightPct: number;
    autoEntryEnabled: boolean;
    entryTargetWeightPct: number | null;
    entryCooldownDays: number;
    lastEntryTriggeredAt: string | null;
    fxMissing: boolean;
    notes: string | null;
    tags: string[];
  }>;
}

export interface NewsSnapshot {
  items: Array<{
    symbol: string;
    title: string;
    ts: string;
  }>;
}

/**
 * LangGraph Annotation — 定义 Agent 的可变状态。
 *
 * 每个字段都有一个 reducer，定义多个节点更新同一字段时的合并策略。
 * 默认 reducer 是 "last write wins"。
 */
export const CognitiveStateAnnotation = Annotation.Root({
  // 输入数据（observe 节点填充）
  focusSymbols: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  portfolio: Annotation<PortfolioSnapshot | null>({ reducer: (_, b) => b, default: () => null }),
  watchlist: Annotation<WatchlistSnapshot | null>({ reducer: (_, b) => b, default: () => null }),
  market: Annotation<MarketSnapshot | null>({ reducer: (_, b) => b, default: () => null }),
  news: Annotation<NewsSnapshot | null>({ reducer: (_, b) => b, default: () => null }),
  activeTheses: Annotation<ResearchThread[]>({ reducer: (_, b) => b, default: () => [] }),

  // 调查队列（prioritize 节点填充）
  investigationQueue: Annotation<InvestigationTarget[]>({ reducer: (_, b) => b, default: () => [] }),
  newThreadSuggestions: Annotation<NewThreadSuggestion[]>({ reducer: (_, b) => b, default: () => [] }),

  // 当前调查目标（循环控制）
  currentTarget: Annotation<InvestigationTarget | null>({ reducer: (_, b) => b, default: () => null }),
  currentThread: Annotation<ResearchThread | null>({ reducer: (_, b) => b, default: () => null }),

  // 调查结果
  investigateResult: Annotation<InvestigateOutput | null>({ reducer: (_, b) => b, default: () => null }),

  // ReAct 循环计数（每次 investigate 重置）
  reactRounds: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),

  // 记忆
  retrievedMemories: Annotation<AgentMemory[]>({ reducer: (_, b) => b, default: () => [] }),

  // Phase 2: 匹配到的调查策略（prioritizeNode 填充，investigateNode 消费）
  matchedStrategies: Annotation<Array<{
    id: string;
    name: string;
    triggerConditions: string;
    toolSequence: string[];
    promptTemplate: string;
    successRate: number;
  }>>({ reducer: (_, b) => b, default: () => [] }),

  // 累积输出
  surprises: Annotation<Surprise[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  reasoningTraces: Annotation<ReasoningTrace[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  toolsCalled: Annotation<ToolCallRecord[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  thesesUpdated: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  memoriesCreated: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  totalTokens: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),

  // Agent 配置（observe 节点从 DB 加载）—— 只放 cognitiveAgent.* 自己独有的字段，
  // rebalanceStrategy / strategy.constraints 等外部配置在需要时从 systemConfig 实时读取，
  // 不再复制到这里（之前的副本容易与 systemConfig 失同步）。
  agentConfig: Annotation<{
    enabled: boolean;
    maxInvestigationTargets: number;
    reviewIntervalDays: number;
    memoryRecallLimit: number;
    circuitBreakerThreshold: number;
    schedule?: string;
    memoryDecayRate?: number;
    maxReactRounds?: number;
    thesisStalenessDays?: number;
  } | null>({ reducer: (_, b) => b, default: () => null }),

  // Phase 4: 子 agent 调查结果（append reducer — 并行子 agent 各自追加）
  subAgentResults: Annotation<Array<{
    threadId: string;
    threadTitle: string;
    summary: string;
    thesisChanged: boolean;
    toolsUsed: string[];
    tokensUsed: number;
  }>>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  // 最终输出
  briefing: Annotation<DailyBriefing | null>({ reducer: (_, b) => b, default: () => null }),

  // 错误
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type CognitiveState = typeof CognitiveStateAnnotation.State;
export type CognitiveUpdate = typeof CognitiveStateAnnotation.Update;
