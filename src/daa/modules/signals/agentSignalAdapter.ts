import type { PortfolioSignal } from "./signalTypes";

export function buildAgentThesisSignal(input: {
  asOf: string;
  assetKeys: string[];
  thesis: string;
  confidencePct?: number;
}): PortfolioSignal | null {
  const assetKeys = input.assetKeys.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean);
  if (!assetKeys.length && !input.thesis.trim()) return null;
  const confidencePct = Math.max(0, Math.min(100, input.confidencePct ?? 75));
  return {
    signalId: `agent:${assetKeys.join(",") || "portfolio"}:${input.asOf}`,
    type: "agent_thesis",
    source: "agent",
    severity: confidencePct >= 80 ? "warn" : "info",
    asOf: input.asOf,
    evidence: [input.thesis],
    assetKeys,
    confidencePct,
    thesis: input.thesis,
  };
}

