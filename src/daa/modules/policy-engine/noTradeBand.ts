import type { DriftSignal } from "@/src/daa/modules/signals/signalTypes";

import type { DaaPolicyConfig, NoTradeBandState } from "./policyTypes";

export function evaluateNoTradeBand(input: {
  driftSignals: DriftSignal[];
  policy: DaaPolicyConfig;
  hasRecentProposal?: boolean;
}): {
  state: NoTradeBandState;
  maxAbsDriftPct: number;
  topSignal: DriftSignal | null;
} {
  const topSignal = input.driftSignals[0] ?? null;
  const maxAbsDriftPct = topSignal?.absDriftPct ?? 0;
  const outerPct = input.policy.drift.outerBandPct * 100;
  const innerPct = input.policy.drift.innerBandPct * 100;

  if (input.hasRecentProposal && maxAbsDriftPct > innerPct) {
    return { state: "cooling", maxAbsDriftPct, topSignal };
  }
  if (maxAbsDriftPct >= outerPct) {
    return { state: "entered_outer", maxAbsDriftPct, topSignal };
  }
  if (maxAbsDriftPct <= innerPct) {
    return { state: "inside", maxAbsDriftPct, topSignal };
  }
  return { state: "exited_inner", maxAbsDriftPct, topSignal };
}

