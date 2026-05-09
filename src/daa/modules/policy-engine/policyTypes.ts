import type { RebalanceTriggerSource } from "@/src/daa/modules/workbench/workbenchTypes";

export type PolicyReviewFrequency = "every_3_days" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual";

export type DriftPolicyConfig = {
  enabled: boolean;
  mode: "static_band" | "volatility_adjusted";
  outerBandPct: number;
  innerBandPct: number;
  minNotionalBase: number;
  volatilityLookbackDays: number;
};

export type ReviewPolicyConfig = {
  enabled: boolean;
  frequency: PolicyReviewFrequency;
  dayOfMonth: number;
  scheduledTimeUtc: string;
  timezone: string;
};

export type AutoActionThrottlePolicy = {
  proposalDedupeWindowHours: number;
  autoExecutionCooldownHours: number;
  allowRiskReductionOverride: boolean;
  allowSevereRiskOverride: boolean;
  minScoreToBreakCooldown: number;
};

export type ActionScorePolicyConfig = {
  proposalThreshold: number;
  autoExecuteThreshold: number;
};

export type DaaPolicyConfig = {
  enabled: boolean;
  shadowMode: boolean;
  drift: DriftPolicyConfig;
  review: ReviewPolicyConfig;
  throttle: AutoActionThrottlePolicy;
  actionScore: ActionScorePolicyConfig;
};

export type PolicyEvaluationSource =
  | "manual_review"
  | "scheduled_review"
  | "drift_monitor"
  | "agent_event"
  | "risk_event"
  | "cash_event";

export type NoTradeBandState = "inside" | "entered_outer" | "cooling" | "exited_inner";

export type PolicyDecisionAction = "ignore" | "observe" | "propose" | "require_review" | "authorize_auto_execute";

export type PolicyCostBenefit = {
  expectedRiskImprovement: number;
  expectedTrackingImprovement: number;
  estimatedCostBase: number;
  turnoverPenalty: number;
  uncertaintyPenalty: number;
};

export type PolicyDecision = {
  decisionId: string;
  source: PolicyEvaluationSource;
  triggerSource: RebalanceTriggerSource;
  action: PolicyDecisionAction;
  score: number;
  threshold: number;
  reasons: string[];
  blockers: string[];
  noTradeBandState: NoTradeBandState;
  costBenefit: PolicyCostBenefit;
  audit: Record<string, unknown>;
  createdAt: string;
};

export type PolicyDecisionSnapshot = {
  decision: PolicyDecision;
  intentIds: string[];
  signalIds: string[];
};

