import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DASHBOARD_VISUAL_SURFACES_V0 } from "../../../app/daa/dashboard/_components/dashboardVisualSurfacesV0";

describe("dashboardVisualSurfacesV0", () => {
  it("keeps a stable set of critical dashboard surfaces", () => {
    expect(DASHBOARD_VISUAL_SURFACES_V0).toMatchInlineSnapshot(`
      [
        {
          "group": "core",
          "id": "run-checklist",
          "title": "Run Checklist",
        },
        {
          "group": "core",
          "id": "confirm-executed",
          "title": "Confirm/Executed",
        },
        {
          "group": "core",
          "id": "history-audit",
          "title": "History/Audit",
        },
        {
          "group": "core",
          "id": "export",
          "title": "Export",
        },
        {
          "group": "inputs",
          "id": "import",
          "title": "Import",
        },
        {
          "group": "inputs",
          "id": "admin-users",
          "title": "Admin Users",
        },
        {
          "group": "inputs",
          "id": "backtest",
          "title": "Backtest",
        },
        {
          "group": "analysis",
          "id": "step2",
          "title": "Step2 — Events",
        },
        {
          "group": "analysis",
          "id": "step4",
          "title": "Step4 — Recommendation",
        },
        {
          "group": "analysis",
          "id": "step5",
          "title": "Step5 — Explain",
        },
        {
          "group": "analysis",
          "id": "step6",
          "title": "Step6 — Human",
        },
        {
          "group": "analysis",
          "id": "step7",
          "title": "Step7 — Tags",
        },
      ]
    `);
  });

  it("uses unique surface ids", () => {
    const ids = DASHBOARD_VISUAL_SURFACES_V0.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps operator scan flow grouped in core -> inputs -> analysis order", () => {
    const groups = DASHBOARD_VISUAL_SURFACES_V0.map((item) => item.group);
    const firstInputs = groups.indexOf("inputs");
    const firstAnalysis = groups.indexOf("analysis");

    expect(firstInputs).toBeGreaterThan(0);
    expect(firstAnalysis).toBeGreaterThan(firstInputs);
    expect(groups.slice(0, firstInputs).every((g) => g === "core")).toBe(true);
    expect(groups.slice(firstInputs, firstAnalysis).every((g) => g === "inputs")).toBe(true);
    expect(groups.slice(firstAnalysis).every((g) => g === "analysis")).toBe(true);
  });

  it("renders each critical surface section in the dashboard page", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const dashboardPageClientPath = join(
      here,
      "../../../app/daa/dashboard/_components/DaaDashboardPageClient.tsx"
    );
    const source = readFileSync(dashboardPageClientPath, "utf8");

    for (const surface of DASHBOARD_VISUAL_SURFACES_V0) {
      expect(source).toContain(`<DashboardSection id=\"${surface.id}\"`);
    }
  });
});
