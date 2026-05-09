import type { DaaPolicyConfig } from "@/src/daa/modules/policy-engine/policyTypes";
import type { PortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateTypes";

import type { DriftSignal } from "./signalTypes";

export function collectDriftSignals(input: {
  portfolioState: PortfolioState;
  policy: DaaPolicyConfig;
}): DriftSignal[] {
  const outerPct = Math.max(0, input.policy.drift.outerBandPct * 100);
  const innerPct = Math.max(0, input.policy.drift.innerBandPct * 100);

  return input.portfolioState.positions
    .filter((row) => row.holdingQty > 0 && row.driftPct != null)
    .map((row) => {
      const absDriftPct = Math.abs(row.driftPct || 0);
      const actualWeightPct = Number.isFinite(row.actualWeightPct) ? row.actualWeightPct : 0;
      const targetWeightPct = Number.isFinite(row.targetWeightPct) ? row.targetWeightPct : 0;
      const enteredOuterBand = absDriftPct >= outerPct;
      const exitedInnerBand = absDriftPct <= innerPct;
      const volatilityAdjustedDrift = outerPct > 0 ? absDriftPct / outerPct : absDriftPct;
      return {
        signalId: `drift:${row.assetKey}:${input.portfolioState.asOf}`,
        type: "drift" as const,
        source: "portfolio_state",
        severity: enteredOuterBand ? "warn" as const : "info" as const,
        asOf: input.portfolioState.asOf,
        evidence: [
          `${row.symbol} actual ${actualWeightPct.toFixed(2)}% vs target ${targetWeightPct.toFixed(2)}%`,
        ],
        assetKey: row.assetKey,
        symbol: row.symbol,
        actualWeightPct,
        targetWeightPct,
        driftPct: row.driftPct || 0,
        absDriftPct,
        volatilityAdjustedDrift,
        enteredOuterBand,
        exitedInnerBand,
      };
    })
    .sort((a, b) => b.absDriftPct - a.absDriftPct);
}
