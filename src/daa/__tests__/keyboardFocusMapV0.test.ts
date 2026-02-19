import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DASHBOARD_SKIP_LINK_TARGETS_V0, MARKET_FUNDS_QUICK_JUMPS_V0 } from "../keyboardFocusMapV0";

describe("keyboardFocusMapV0", () => {
  it("keeps stable keyboard anchors for dashboard and market/funds", () => {
    expect({ dashboard: DASHBOARD_SKIP_LINK_TARGETS_V0, marketFunds: MARKET_FUNDS_QUICK_JUMPS_V0 }).toMatchInlineSnapshot(`
      {
        "dashboard": [
          {
            "label": "Skip to run checklist",
            "targetId": "run-checklist",
          },
          {
            "label": "Skip to Step2 events",
            "targetId": "step2",
          },
          {
            "label": "Skip to history and audit",
            "targetId": "history-audit",
          },
        ],
        "marketFunds": [
          {
            "label": "Portfolio",
            "targetId": "portfolio",
          },
          {
            "label": "Prices",
            "targetId": "prices",
          },
          {
            "label": "Targets",
            "targetId": "target-weights",
          },
          {
            "label": "Rebalance",
            "targetId": "rebalance",
          },
          {
            "label": "History",
            "targetId": "dynamic-rebalance-run-history",
          },
          {
            "label": "Import/Export",
            "targetId": "import",
          },
        ],
      }
    `);
  });

  it("uses unique focus target ids in each surface", () => {
    const dashboardIds = DASHBOARD_SKIP_LINK_TARGETS_V0.map((item) => item.targetId);
    const marketFundsIds = MARKET_FUNDS_QUICK_JUMPS_V0.map((item) => item.targetId);

    expect(new Set(dashboardIds).size).toBe(dashboardIds.length);
    expect(new Set(marketFundsIds).size).toBe(marketFundsIds.length);
  });

  it("keeps market/funds quick jumps ordered by operator step-card priority", () => {
    const ids = MARKET_FUNDS_QUICK_JUMPS_V0.map((item) => item.targetId);

    expect(ids.indexOf("portfolio")).toBe(0);
    expect(ids.indexOf("prices")).toBe(1);
    expect(ids.indexOf("target-weights")).toBe(2);
    expect(ids.indexOf("rebalance")).toBe(3);
    expect(ids.indexOf("dynamic-rebalance-run-history")).toBeGreaterThan(ids.indexOf("rebalance"));
    expect(ids.indexOf("import")).toBe(ids.length - 1);
  });

  it("keeps dashboard skip links in top-to-bottom operator scan order", () => {
    const ids = DASHBOARD_SKIP_LINK_TARGETS_V0.map((item) => item.targetId);

    expect(ids).toEqual(["run-checklist", "step2", "history-audit"]);
  });

  it("keeps market/funds quick-jump labels aligned with action-priority wording", () => {
    const labels = MARKET_FUNDS_QUICK_JUMPS_V0.map((item) => item.label);

    expect(labels).toEqual(["Portfolio", "Prices", "Targets", "Rebalance", "History", "Import/Export"]);
  });

  it("keeps dashboard skip-link labels aligned with operator scan wording", () => {
    const labels = DASHBOARD_SKIP_LINK_TARGETS_V0.map((item) => item.label);

    expect(labels).toEqual(["Skip to run checklist", "Skip to Step2 events", "Skip to history and audit"]);
  });

  it("keeps action-first quick-jump labels ahead of history/import", () => {
    const labels = MARKET_FUNDS_QUICK_JUMPS_V0.map((item) => item.label);

    expect(labels.slice(0, 4)).toEqual(["Portfolio", "Prices", "Targets", "Rebalance"]);
    expect(labels.slice(4)).toEqual(["History", "Import/Export"]);
  });

  it("keeps dashboard skip-link copy prefixed with 'Skip to'", () => {
    const labels = DASHBOARD_SKIP_LINK_TARGETS_V0.map((item) => item.label);

    expect(labels.every((label) => label.startsWith("Skip to "))).toBe(true);
  });

  it("renders each target id in the dashboard and market/funds components", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const dashboardPath = join(here, "../../../app/daa/dashboard/_components/DaaDashboardPageClient.tsx");
    const marketFundsPath = join(here, "../../../app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    const dashboardSource = readFileSync(dashboardPath, "utf8");
    const marketFundsSource = readFileSync(marketFundsPath, "utf8");

    for (const item of DASHBOARD_SKIP_LINK_TARGETS_V0) {
      expect(dashboardSource).toContain(`id=\"${item.targetId}\"`);
    }

    for (const item of MARKET_FUNDS_QUICK_JUMPS_V0) {
      expect(marketFundsSource).toContain(`id=\"${item.targetId}\"`);
    }
  });
});
