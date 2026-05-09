import type { PortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateTypes";

import type { CashSignal } from "./signalTypes";

export function collectCashSignals(input: {
  portfolioState: PortfolioState;
  idleThresholdPct?: number;
}): CashSignal[] {
  const nav = Math.max(0, input.portfolioState.navBase);
  if (!(nav > 0)) return [];
  const cashPct = input.portfolioState.cashBase / nav;
  const threshold = input.idleThresholdPct ?? 0.1;
  if (cashPct < threshold) return [];
  return [{
    signalId: `cash:idle:${input.portfolioState.asOf}`,
    type: "cash",
    source: "portfolio_state",
    severity: cashPct >= threshold * 2 ? "warn" : "info",
    asOf: input.portfolioState.asOf,
    evidence: [`cash ${(cashPct * 100).toFixed(2)}% of NAV`],
    cashPct,
  }];
}

