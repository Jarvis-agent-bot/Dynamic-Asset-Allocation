export type DaaMomentumRegime = "strong" | "neutral" | "weak";
export type DaaAnalystStance = "offensive" | "neutral" | "defensive";

export type DaaHumanSourceChannel =
  | "official_regulatory"
  | "official_fund_house"
  | "exchange_disclosure"
  | "third_party";

export type DaaHumanActorKind = "institution" | "fund_manager" | "fund";

export type DaaHumanActorQuality = {
  accuracyPct: number;
  riskControlPct: number;
  disciplinePct: number;
  transparencyPct: number;
  maxDrawdownPenaltyPct: number;
};

export type DaaHumanActor = {
  actorId: string;
  displayName: string;
  kind: DaaHumanActorKind;
  markets: string[];
  styleCluster: string;
  stance: DaaAnalystStance;
  quality: DaaHumanActorQuality;
  sourcePolicy: "official_first" | "hybrid";
};

export type DaaActorHoldingSnapshot = {
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
  sourceChannel: DaaHumanSourceChannel;
  sourceName: string;
  sourceRef: string;
  confidencePct: number;
};

export type DaaHumanSignal = {
  symbol: string;
  market: string;
  aggregatedScorePct: number;
  convictionPct: number;
  thesisDriftPct: number;
  momentumRegime: DaaMomentumRegime;
  stance: DaaAnalystStance;
  confidencePct: number;
  evidenceCount: number;
  actorIds: string[];
  sourceRefs: string[];
  riskTags: string[];
};

export type DaaHumanSignalSourceSummary = {
  channel: DaaHumanSourceChannel;
  sourceName: string;
  itemCount: number;
};

export type DaaHumanSignalBatch = {
  generatedAt: string;
  asOfDate: string;
  marketScope: string[];
  mode: "official_first" | "danjuan_primary_with_official_fallback";
  sourceStatus?: "live" | "fallback_seed";
  diagnostics?: string[];
  actorCount: number;
  holdingCount: number;
  signals: DaaHumanSignal[];
  sources: DaaHumanSignalSourceSummary[];
};

export type DaaHumanIngestSummary = {
  ingestedAt: string;
  marketScope: string[];
  actorCount: number;
  holdingCount: number;
  signalCount: number;
  mode: "official_first" | "danjuan_primary_with_official_fallback";
  sourceStatus?: "live" | "fallback_seed";
  diagnostics?: string[];
};
