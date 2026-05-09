import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDaaAdminEditorAuth: vi.fn(async () => null),
  executeRebalanceViaGateway: vi.fn(),
  buildWorkbenchExecuteSummary: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminEditorAuth: mocks.requireDaaAdminEditorAuth,
}));

vi.mock("@/src/daa/modules/workbench/executionGateway", () => ({
  executeRebalanceViaGateway: mocks.executeRebalanceViaGateway,
}));

vi.mock("@/src/daa/modules/workbench/workbenchExecutionService", () => ({
  buildWorkbenchExecuteSummary: mocks.buildWorkbenchExecuteSummary,
}));

import { POST as executeRoute } from "@/app/api/daa/workbench/rebalance/execute/route";
import { POST as executeSummaryRoute } from "@/app/api/daa/workbench/rebalance/execute-summary/route";

describe("workbench-rebalance-execute-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRebalanceViaGateway.mockResolvedValue({
      cycle: {
        cycleId: "cycle-1",
        status: "completed",
        executedOrders: [],
        executionSummary: null,
      },
      logs: [],
    });
    mocks.buildWorkbenchExecuteSummary.mockResolvedValue({
      cycleId: "cycle-1",
      executeMode: "selected",
      orderCount: 0,
      buyNotional: 0,
      sellNotional: 0,
      estimatedFees: 0,
      netCashImpact: 0,
      topWeightChanges: [],
      riskWarnings: [],
      riskOverallStatus: "pass",
    });
  });

  it("执行路由缺省 executeMode 时默认只执行已选建议", async () => {
    const response = await executeRoute(new Request("http://localhost/api/daa/workbench/rebalance/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycleId: "cycle-1" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.executeRebalanceViaGateway).toHaveBeenCalledWith({
      cycleId: "cycle-1",
      executeMode: "selected",
    });
  });

  it("执行摘要路由缺省 executeMode 时默认只预览已选建议", async () => {
    const response = await executeSummaryRoute(new Request("http://localhost/api/daa/workbench/rebalance/execute-summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycleId: "cycle-1" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.buildWorkbenchExecuteSummary).toHaveBeenCalledWith({
      cycleId: "cycle-1",
      executeMode: "selected",
    });
  });

  it("只有显式 all 时才执行全部建议", async () => {
    await executeRoute(new Request("http://localhost/api/daa/workbench/rebalance/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycleId: "cycle-1", executeMode: "all" }),
    }));

    expect(mocks.executeRebalanceViaGateway).toHaveBeenCalledWith({
      cycleId: "cycle-1",
      executeMode: "all",
    });
  });
});
