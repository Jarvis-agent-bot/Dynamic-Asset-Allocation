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

  it("keeps core section priority order stable for operator triage", () => {
    const coreIds = DASHBOARD_VISUAL_SURFACES_V0.filter((item) => item.group === "core").map((item) => item.id);

    expect(coreIds).toEqual(["run-checklist", "confirm-executed", "history-audit", "export"]);
  });

  it("keeps analysis section progression stable for operator scan flow", () => {
    const analysisIds = DASHBOARD_VISUAL_SURFACES_V0.filter((item) => item.group === "analysis").map((item) => item.id);

    expect(analysisIds).toEqual(["step2", "step4", "step5", "step6", "step7"]);
  });

  it("keeps analysis labels aligned with expected step wording", () => {
    const analysisTitles = DASHBOARD_VISUAL_SURFACES_V0.filter((item) => item.group === "analysis").map((item) => item.title);

    expect(analysisTitles).toEqual([
      "Step2 — Events",
      "Step4 — Recommendation",
      "Step5 — Explain",
      "Step6 — Human",
      "Step7 — Tags",
    ]);
  });

  it("keeps input section labels stable for operator prep flow", () => {
    const inputTitles = DASHBOARD_VISUAL_SURFACES_V0.filter((item) => item.group === "inputs").map((item) => item.title);

    expect(inputTitles).toEqual(["Import", "Admin Users", "Backtest"]);
  });

  it("keeps core section labels stable for top-level operator triage", () => {
    const coreTitles = DASHBOARD_VISUAL_SURFACES_V0.filter((item) => item.group === "core").map((item) => item.title);

    expect(coreTitles).toEqual(["Run Checklist", "Confirm/Executed", "History/Audit", "Export"]);
  });

  it("keeps all dashboard surface titles non-empty for operator scan readability", () => {
    const titles = DASHBOARD_VISUAL_SURFACES_V0.map((item) => item.title);

    expect(titles.every((title) => title.trim().length > 0)).toBe(true);
  });

  it("keeps all dashboard surface ids non-empty for anchor stability", () => {
    const ids = DASHBOARD_VISUAL_SURFACES_V0.map((item) => item.id);

    expect(ids.every((id) => id.trim().length > 0)).toBe(true);
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

    expect(source).toContain("Quick actions");
    expect(source).toContain("Find an action");
    expect(source).toContain("Type to filter actions");
    expect(source).toContain("No quick actions match your filter.");
  });
});
