import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { collectRiskTriggerAssets } from "@/src/daa/modules/portfolio-state/positionPnl";
import type { PortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateTypes";

import type { RiskSignal } from "./signalTypes";

export function collectRiskSignals(input: {
  portfolioState: PortfolioState;
  systemConfig: DaaSystemConfig;
}): RiskSignal[] {
  const risk = input.systemConfig.strategy.risk;
  const out: RiskSignal[] = [];

  for (const hit of collectRiskTriggerAssets({
    rows: input.portfolioState.positions,
    perAssetStopLossPct: risk.perAssetStopLossPct,
    perAssetTakeProfitPct: risk.perAssetTakeProfitPct,
  })) {
    out.push({
      signalId: `risk:${hit.triggerType}:${hit.assetKey}:${input.portfolioState.asOf}`,
      type: "risk",
      source: "portfolio_state",
      severity: hit.triggerType === "stop_loss" ? "critical" : "warn",
      asOf: input.portfolioState.asOf,
      evidence: [`${hit.symbol} unrealized PnL ${hit.pnlPct.toFixed(2)}%`],
      assetKey: hit.assetKey,
      symbol: hit.symbol,
      riskKind: hit.triggerType,
      valuePct: hit.pnlPct,
    });
  }

  if (input.portfolioState.dataHealth.status !== "ok") {
    out.push({
      signalId: `risk:data_health:${input.portfolioState.asOf}`,
      type: "risk",
      source: "portfolio_state",
      severity: "warn",
      asOf: input.portfolioState.asOf,
      evidence: [input.portfolioState.dataHealth.message || "market data degraded"],
      assetKey: "PORTFOLIO",
      symbol: "PORTFOLIO",
      riskKind: "data_health",
      valuePct: 0,
    });
  }

  return out;
}
