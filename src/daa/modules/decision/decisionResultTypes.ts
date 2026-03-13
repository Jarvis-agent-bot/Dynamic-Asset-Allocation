import type { DaaLlmAnalysis } from "@/src/daa/llm/llmAnalysis";
import type { DaaOpportunityPanel } from "@/src/daa/signals/opportunityService";
import type { DaaUnifiedResponse } from "@/src/daa/unifiedRebalance";

export type DecisionHydrationDiagnostics = {
  addedTargets: string[];
  candidateCount: number;
  fxRateCount: number;
  humanSourceStatus: "live" | "fallback_seed" | "unknown";
  humanDiagnostics: string[];
};

export type DecisionStatus = "pending" | "partial" | "executed" | "canceled" | "skipped";

export type UnifiedDecisionResult = {
  schemaVersion: 2;
  generatedAt: string;
  plan: DaaUnifiedResponse;
  opportunityPanel: DaaOpportunityPanel;
  hydrationDiagnostics: DecisionHydrationDiagnostics;
  llmAnalysis: DaaLlmAnalysis;
  decisionId?: string;
  decisionStatus?: DecisionStatus;
};
