import type { DaaFundManagerOpsBySymbolV1 } from "@/src/daa/hf/hfServiceV1";
import type { DaaLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import type { DaaOpportunityActionV1 } from "@/src/daa/signals/fusionV1";
import type { DaaNewsSignalV1 } from "@/src/daa/signals/newsSignalV1";
import type { DaaTechnicalSignalV1 } from "@/src/daa/signals/technicalSignalV1";

export type AssetInsightDetailModeV1 = "lite" | "full";

export type DaaAssetInsightLiteV1 = {
  finalScorePct: number;
  confidencePct: number;
  riskScorePct: number;
  action: DaaOpportunityActionV1;
  reasons: string[];
};

export type DaaAssetInsightRowV1 = {
  symbol: string;
  lite: DaaAssetInsightLiteV1;
  technical: DaaTechnicalSignalV1 | null;
  news: DaaNewsSignalV1 | null;
  fundManagerOps: DaaFundManagerOpsBySymbolV1 | null;
  llmAnalysis: DaaLlmAnalysisV1 | null;
};

export type DaaAssetInsightsDiagnosticsV1 = {
  humanSourceStatus: "live" | "fallback_seed" | "unknown";
  humanDiagnostics: string[];
  opportunityCount: number;
  technicalSignalCount: number;
  newsSignalCount: number;
};

export type DaaAssetInsightsResponseV1 = {
  schemaVersion: 2;
  generatedAt: string;
  detailMode: AssetInsightDetailModeV1;
  analysisFocus: string;
  insights: DaaAssetInsightRowV1[];
  diagnostics: DaaAssetInsightsDiagnosticsV1;
};
