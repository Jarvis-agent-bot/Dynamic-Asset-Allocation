import type { DaaLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import type { DaaOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import type { DaaUnifiedResponseV1 } from "@/src/daa/unifiedRebalanceV1";

export type DecisionHydrationDiagnosticsV2 = {
  addedTargets: string[];
  candidateCount: number;
  fxRateCount: number;
  humanSourceStatus: "live" | "fallback_seed" | "unknown";
  humanDiagnostics: string[];
};

export type DecisionStatusV2 = "pending" | "partial" | "executed" | "canceled" | "skipped";

export type UnifiedDecisionResultV2 = {
  schemaVersion: 2;
  generatedAt: string;
  plan: DaaUnifiedResponseV1;
  opportunityPanel: DaaOpportunityPanelV1;
  hydrationDiagnostics: DecisionHydrationDiagnosticsV2;
  llmAnalysis: DaaLlmAnalysisV1;
  decisionId?: string;
  decisionStatus?: DecisionStatusV2;
};
