export type DaaAssistantIntent =
  | { kind: "help"; rawText: string }
  | { kind: "portfolio_status"; rawText: string }
  | { kind: "risk_status"; rawText: string }
  | { kind: "market_status"; rawText: string }
  | { kind: "latest_cycle"; rawText: string }
  | { kind: "rebalance_generate"; rawText: string }
  | { kind: "rebalance_execute"; rawText: string; executeMode: "all" }
  | { kind: "confirm_action"; rawText: string }
  | { kind: "cancel_action"; rawText: string }
  | { kind: "trade"; rawText: string; side: "BUY" | "SELL"; symbol: string; qty: number | null; notional: number | null }
  | { kind: "thesis_status"; rawText: string }
  | { kind: "agent_briefing"; rawText: string }
  | { kind: "llm_answer"; rawText: string; answer: string | null }
  | { kind: "unknown"; rawText: string };

export type AssistantPlanningInput = {
  userText: string;
  allowExecution: boolean;
  contextDigest: string;
  sessionSummary: string;
  recentConversation: string;
  pendingActionDescription: string;
  learningDigest?: string | null;
};

export type AssistantPlanningResult = {
  intent: DaaAssistantIntent;
  source: "llm" | "fallback";
  plannerRawText: string | null;
};
