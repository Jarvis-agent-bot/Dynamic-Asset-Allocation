export type KeyboardFocusAnchorV0 = {
  targetId: string;
  label: string;
};

// Stable registry for keyboard jump targets across the canonical dashboard and
// the market/funds hub panel. Snapshot tests use this to catch focus drift.
export const DASHBOARD_SKIP_LINK_TARGETS_V0: KeyboardFocusAnchorV0[] = [
  { targetId: "run-checklist", label: "Skip to run checklist" },
  { targetId: "step2", label: "Skip to Step2 events" },
  { targetId: "history-audit", label: "Skip to history and audit" },
];

export const MARKET_FUNDS_QUICK_JUMPS_V0: KeyboardFocusAnchorV0[] = [
  { targetId: "portfolio", label: "Portfolio" },
  { targetId: "prices", label: "Prices" },
  { targetId: "target-weights", label: "Targets" },
  { targetId: "rebalance", label: "Rebalance" },
  { targetId: "dynamic-rebalance-run-history", label: "History" },
  { targetId: "import", label: "Import/Export" },
];
