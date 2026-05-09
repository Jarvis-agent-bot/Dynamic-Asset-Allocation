import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { DaaPolicyConfig } from "@/src/daa/modules/policy-engine/policyTypes";
import type { PortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateTypes";

import { collectCashSignals } from "./cashSignalService";
import { collectDriftSignals } from "./driftSignalService";
import { collectRiskSignals } from "./riskSignalService";
import type { MarketRegimeSignal, PortfolioSignal } from "./signalTypes";

export function collectPortfolioSignals(input: {
  portfolioState: PortfolioState;
  systemConfig: DaaSystemConfig;
  policy: DaaPolicyConfig;
  marketContext?: { regime?: string; riskOffScorePct?: number; generatedAt?: string | null } | null;
}): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [
    ...collectDriftSignals({ portfolioState: input.portfolioState, policy: input.policy }),
    ...collectRiskSignals({ portfolioState: input.portfolioState, systemConfig: input.systemConfig }),
    ...collectCashSignals({ portfolioState: input.portfolioState }),
  ];

  if (input.marketContext?.regime) {
    const riskOffScorePct = Math.max(0, Number(input.marketContext.riskOffScorePct) || 0);
    const marketSignal: MarketRegimeSignal = {
      signalId: `market:${input.marketContext.regime}:${input.portfolioState.asOf}`,
      type: "market_regime",
      source: "market_context",
      severity: riskOffScorePct >= 70 ? "warn" : "info",
      asOf: input.marketContext.generatedAt || input.portfolioState.asOf,
      evidence: [`regime ${input.marketContext.regime}, risk score ${riskOffScorePct.toFixed(1)}`],
      regime: input.marketContext.regime,
      riskOffScorePct,
    };
    signals.push(marketSignal);
  }

  return signals;
}

