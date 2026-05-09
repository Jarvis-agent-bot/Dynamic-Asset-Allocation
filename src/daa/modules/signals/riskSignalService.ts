import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { PortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateTypes";

import type { RiskSignal } from "./signalTypes";

export function collectRiskSignals(input: {
  portfolioState: PortfolioState;
  systemConfig: DaaSystemConfig;
}): RiskSignal[] {
  const risk = input.systemConfig.strategy.risk;
  const stopLossPct = Math.max(0, risk.perAssetStopLossPct * 100);
  const takeProfitPct = Math.max(0, risk.perAssetTakeProfitPct * 100);
  const out: RiskSignal[] = [];

  for (const row of input.portfolioState.positions) {
    if (!(row.holdingQty > 0) || row.unrealizedPnlPct == null) continue;
    if (stopLossPct > 0 && row.unrealizedPnlPct <= -stopLossPct) {
      out.push({
        signalId: `risk:stop_loss:${row.assetKey}:${input.portfolioState.asOf}`,
        type: "risk",
        source: "portfolio_state",
        severity: "critical",
        asOf: input.portfolioState.asOf,
        evidence: [`${row.symbol} unrealized PnL ${row.unrealizedPnlPct.toFixed(2)}%`],
        assetKey: row.assetKey,
        symbol: row.symbol,
        riskKind: "stop_loss",
        valuePct: row.unrealizedPnlPct,
      });
    }
    if (takeProfitPct > 0 && row.unrealizedPnlPct >= takeProfitPct) {
      out.push({
        signalId: `risk:take_profit:${row.assetKey}:${input.portfolioState.asOf}`,
        type: "risk",
        source: "portfolio_state",
        severity: "warn",
        asOf: input.portfolioState.asOf,
        evidence: [`${row.symbol} unrealized PnL ${row.unrealizedPnlPct.toFixed(2)}%`],
        assetKey: row.assetKey,
        symbol: row.symbol,
        riskKind: "take_profit",
        valuePct: row.unrealizedPnlPct,
      });
    }
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

