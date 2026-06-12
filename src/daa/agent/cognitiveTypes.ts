/**
 * Investment Review Assistant OS — 核心类型定义
 *
 * investment-judgment-driven 投资助理复核链路的数据模型。
 */

// ── 投资判断（内部沿用 thesis/thread 契约） ──

export type ThesisStatus = "active" | "paused" | "archived" | "invalidated";
export type ThesisConviction = "high" | "medium" | "low" | "uncertain";
export type ThesisReviewStatus = "pending" | "investigating" | "waiting_human" | "resolved" | "snoozed";

export interface ResearchThread {
  id: string;
  title: string;
  status: ThesisStatus;
  thesisText: string;
  conviction: ThesisConviction;
  invalidationConditions: string | null;
  reviewAt: string | null; // ISO timestamp
  assetKeys: string[];
  tags: string[];
  priorityScore: number;
  /** 人最近一次看到该判断的时间。它不代表投资助理做过复核。 */
  lastSeenAt?: string | null;
  /** 投资助理最近一次完成有效复核的时间。Today 页“太久没看”优先看这个字段。 */
  lastInvestigatedAt?: string | null;
  /** 最近一次有依据写入的时间。 */
  lastEvidenceAt?: string | null;
  /** 最近一次由人或执行层形成决策的时间。 */
  lastDecisionAt?: string | null;
  reviewStatus?: ThesisReviewStatus;
  createdAt: string;
  updatedAt: string;
}

// ── 判断依据 ──

export type EvidenceType = "supporting" | "contradicting" | "neutral";
export type EvidenceSource = "market_data" | "news" | "technical" | "valuation" | "agent_reasoning" | "human" | "trade_outcome";

export interface EvidenceItem {
  id: string;
  threadId: string;
  evidenceType: EvidenceType;
  source: EvidenceSource;
  content: string;
  dataSnapshot: Record<string, unknown> | null;
  confidence: number;
  createdAt: string;
}

// ── 投资助理运行记录 ──

export type AgentRunStatus = "running" | "completed" | "completed_with_errors" | "failed" | "interrupted";
export type AgentTrigger = "scheduled" | "manual" | "event_driven";

export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  outputSummary: string;
  durationMs: number;
}

export interface AgentRun {
  id: string;
  trigger: AgentTrigger;
  langgraphThreadId: string | null;
  status: AgentRunStatus;
  targetThreadIds: string[];
  toolsCalled: ToolCallRecord[];
  reasoningTraces: ReasoningTrace[];
  surprises: Surprise[];
  briefing: DailyBriefing | null;
  totalTokens: number;
  totalCostUsd: number;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ReasoningTrace {
  node: string;
  threadId: string | null;
  input: string;
  output: string;
  tokensUsed: number;
  durationMs: number;
}

// ── 投资助理记忆 ──

export type MemoryType = "pattern" | "lesson" | "preference" | "fact";

export interface AgentMemory {
  id: string;
  memoryType: MemoryType;
  content: string;
  sourceRunIds: string[];
  relevanceTags: string[];
  embedding: number[] | null;
  strength: number;
  createdAt: string;
  lastAccessed: string;
}

// ── 投资助理输出 ──

export interface Surprise {
  title: string;
  description: string;
  relatedThesisId: string | null;
  severityScore: number; // 1-10
  suggestedAction: string;
}

export interface CognitionGap {
  assetKey: string;
  sourceThesisId?: string | null;
  sourceThesisTitle?: string | null;
  portfolioWeight: number;
  daysSinceLastInvestigation: number;
  lastInvestigatedAt?: string | null;
  reviewStatus?: ThesisReviewStatus;
  uncertaintyReason: string;
  suggestedInvestigation: string;
}

export interface MindChangeCondition {
  thesisTitle: string;
  currentConviction: ThesisConviction;
  conditions: string[];
  monitoringIndicators: string[];
}

/** Feature B: 投资判断失效对组合的影响 */
export interface ThesisFailureImpact {
  threadId: string;
  thesisTitle: string;
  conviction: ThesisConviction;
  affectedAssets: Array<{ assetKey: string; weightPct: number }>;
  totalExposurePct: number;
  estimatedLossPct: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

/** Feature C: 投资判断之间的不一致 */
export interface ThesisConflict {
  thesisA: { id: string; title: string; conviction: ThesisConviction };
  thesisB: { id: string; title: string; conviction: ThesisConviction };
  conflictType: "directional" | "asset_overlap" | "macro_inconsistency";
  overlappingAssets: string[];
  severity: "low" | "medium" | "high";
  llmAssessment: string | null;
}

export interface AutopilotCoverageSummary {
  holdingAssets: number;
  watchlistCandidates: number;
  watchlistTargetedAssets: number;
  brainPlanIntents: number;
  acceptedBrainPlanIntents: number;
}

export interface DailyBriefing {
  surprises: Surprise[];
  cognitionGaps: CognitionGap[];
  mindChangeConditions: MindChangeCondition[];
  thesisFailureImpacts?: ThesisFailureImpact[];
  thesisConflicts?: ThesisConflict[];
  autopilotCoverage?: AutopilotCoverageSummary;
  /** 投资助理生成的目标权重计划（由 LLM 生成，执行层消费） */
  strategyOverlay?: AgentStrategyOverlay;
  /** 子 agent 并行复核的摘要 */
  subAgentSummaries?: Array<{
    threadId: string;
    threadTitle: string;
    summary: string;
    thesisChanged: boolean;
    toolsUsed: string[];
  }>;
  thesesUpdated: number;
  memoriesCreated: number;
  totalTokens: number;
  estimatedCost: number;
}

// ── 投资助理策略 Overlay ──

/** 投资助理 LLM 输出的目标权重计划，执行层负责转成订单并做硬风控 */
export interface AgentStrategyOverlay {
  generatedAt: string;
  agentRunId: string;

  /** 市场 regime 覆盖（null 表示同意规则引擎判断） */
  regimeOverride: {
    suggestedRegime: "risk_on" | "transitional" | "risk_off";
    confidence: number; // 0-100
    reasoning: string;
    ruleBasedRegime: string;
  } | null;

  targetAllocationPlan?: {
    reasoning: string;
    intents: Array<{
      assetKey: string;
      symbol: string;
      /** 百分比口径，例如 3 表示 3% NAV */
      proposedTargetWeightPct: number;
      /** 0-100；低置信度意图不会自动执行 */
      confidence: number;
      reasoning: string;
    }>;
  } | null;
}

// ── LangGraph 状态 ──

export interface InvestigationTarget {
  threadId: string | null; // null = 新 thread 需要创建
  reason: string;
  dataNeeded: string[]; // tool 名称列表
}

export interface NewThreadSuggestion {
  title: string;
  initialThesis: string;
  assetKeys: string[];
  tags: string[];
}

export interface InvestigateOutput {
  thesisChanged: boolean;
  updatedThesis: string | null;
  newConviction: ThesisConviction | null;
  evidenceType: EvidenceType;
  evidenceSummary: string;
  surprises: Surprise[];
  invalidationConditions: string | null;
  suggestedReviewDays: number; // 多少天后复盘
  nextActions: string[];
}
