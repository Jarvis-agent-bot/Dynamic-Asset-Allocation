export type GuardrailBreachGateInputV0 = {
  gate: "price-warnings" | "guardrail-violations" | "cash-settlement" | "liquidity-t+n";
  blocked: boolean;
  reason: string;
};

export type GuardrailBreachTimelineRowV0 = {
  gate: GuardrailBreachGateInputV0["gate"];
  status: "pass" | "blocked";
  reason: string;
};

export function buildGuardrailBreachExplainerTimelineV0(
  gates: GuardrailBreachGateInputV0[],
): GuardrailBreachTimelineRowV0[] {
  return gates.map((g) => ({
    gate: g.gate,
    status: g.blocked ? "blocked" : "pass",
    reason: g.reason,
  }));
}
