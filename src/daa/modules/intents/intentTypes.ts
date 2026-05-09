export type InvestmentIntentSource =
  | "drift"
  | "calendar_review"
  | "agent_thesis"
  | "risk_reduction"
  | "cash_deploy"
  | "manual";

export type InvestmentIntent = {
  intentId: string;
  source: InvestmentIntentSource;
  action: "increase" | "decrease" | "hold" | "risk_reduce" | "review_only";
  assetKeys: string[];
  thesis: string;
  confidencePct: number;
  expiresAt: string | null;
  evidenceRefs: string[];
};

