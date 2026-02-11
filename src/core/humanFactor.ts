export type RiskPreference = "high" | "mid" | "low";
export type RiskScore = "high" | "mid" | "low" | "sb";

export type HumanProfile = {
  id: string;
  name: string;
  riskPreference?: RiskPreference;
  riskScore?: RiskScore;
  // Future: trackRecord, aum, fundList, tenure, etc.
};

export type HumanFactorResult = {
  weight: number; // 0..1
  explain: string[];
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// v0: simple tag-driven weighting. Real track record ingestion comes later.
export function computeHumanFactor(profile: HumanProfile): HumanFactorResult {
  let w = 0.5;
  const explain: string[] = [];

  if (profile.riskPreference) {
    explain.push(`riskPreference=${profile.riskPreference}`);
  }

  if (profile.riskScore) {
    explain.push(`riskScore=${profile.riskScore}`);
    if (profile.riskScore === "sb") {
      w -= 0.35;
      explain.push("riskScore=sb => downweight (empirical: worse than random)");
    }
  }

  return { weight: clamp01(w), explain };
}
