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
