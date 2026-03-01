import type { DaaAnalystStanceV1, DaaMomentumRegimeV1 } from "@/src/daa/unifiedRebalanceV1";

export type DaaHumanSourceChannelV1 =
  | "official_regulatory"
  | "official_fund_house"
  | "exchange_disclosure"
  | "third_party";

export type DaaHumanActorKindV1 = "institution" | "fund_manager" | "fund";

export type DaaHumanActorQualityV1 = {
  accuracyPct: number;
  riskControlPct: number;
  disciplinePct: number;
  transparencyPct: number;
  maxDrawdownPenaltyPct: number;
};

export type DaaHumanActorV1 = {
  actorId: string;
  displayName: string;
  kind: DaaHumanActorKindV1;
  markets: string[];
  styleCluster: string;
  stance: DaaAnalystStanceV1;
  quality: DaaHumanActorQualityV1;
  sourcePolicy: "official_first" | "hybrid";
};

export type DaaActorHoldingSnapshotV1 = {
  snapshotId: string;
  actorId: string;
  symbol: string;
  market: string;
  asOfDate: string;
  disclosedAt: string;
  weightPct: number;
  prevWeightPct: number;
  shares: number;
  marketValueUsd: number;
  sourceChannel: DaaHumanSourceChannelV1;
  sourceName: string;
  sourceRef: string;
  confidencePct: number;
};

export type DaaHumanSignalV1 = {
  symbol: string;
  market: string;
  aggregatedScorePct: number;
  convictionPct: number;
  thesisDriftPct: number;
  momentumRegime: DaaMomentumRegimeV1;
  stance: DaaAnalystStanceV1;
  confidencePct: number;
  evidenceCount: number;
  actorIds: string[];
  sourceRefs: string[];
  riskTags: string[];
};

export type DaaHumanSignalSourceSummaryV1 = {
  channel: DaaHumanSourceChannelV1;
  sourceName: string;
  itemCount: number;
};

export type DaaHumanSignalBatchV1 = {
  generatedAt: string;
  asOfDate: string;
  marketScope: string[];
  mode: "official_first" | "danjuan_primary_with_official_fallback";
  sourceStatus?: "live" | "fallback_seed";
  diagnostics?: string[];
  actorCount: number;
  holdingCount: number;
  signals: DaaHumanSignalV1[];
  sources: DaaHumanSignalSourceSummaryV1[];
};

export type DaaHumanIngestSummaryV1 = {
  ingestedAt: string;
  marketScope: string[];
  actorCount: number;
  holdingCount: number;
  signalCount: number;
  mode: "official_first" | "danjuan_primary_with_official_fallback";
  sourceStatus?: "live" | "fallback_seed";
  diagnostics?: string[];
};
