export type DashboardVisualSurfaceV0 = {
  id: string;
  title: string;
  group: "core" | "inputs" | "analysis";
};

// Keep this registry stable so snapshot-style tests can detect accidental UI drift.
export const DASHBOARD_VISUAL_SURFACES_V0: DashboardVisualSurfaceV0[] = [
  { id: "run-checklist", title: "Run Checklist", group: "core" },
  { id: "confirm-executed", title: "Confirm/Executed", group: "core" },
  { id: "history-audit", title: "History/Audit", group: "core" },
  { id: "export", title: "Export", group: "core" },
  { id: "import", title: "Import", group: "inputs" },
  { id: "admin-users", title: "Admin Users", group: "inputs" },
  { id: "backtest", title: "Backtest", group: "inputs" },
  { id: "step2", title: "Step2 — Events", group: "analysis" },
  { id: "step4", title: "Step4 — Recommendation", group: "analysis" },
  { id: "step5", title: "Step5 — Explain", group: "analysis" },
  { id: "step6", title: "Step6 — Human", group: "analysis" },
  { id: "step7", title: "Step7 — Tags", group: "analysis" },
];
