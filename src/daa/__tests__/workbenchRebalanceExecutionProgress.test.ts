import { describe, expect, it } from "vitest";

import { mergeCycleExecutionProgress } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

describe("workbench-rebalance-execution-progress", () => {
  it("分批补执行时合并历史 ticket 并累计执行汇总", () => {
    const merged = mergeCycleExecutionProgress({
      existingOrderIds: ["ticket-old", "ticket-dup"],
      newOrderIds: ["ticket-new", "ticket-dup"],
      existingSummary: {
        ordersExecuted: 1,
        ordersSubmitted: 0,
        ordersFailed: 1,
        totalNotional: 100,
        newMaxDriftPct: 4.5,
      },
      newSummary: {
        ordersExecuted: 2,
        ordersSubmitted: 1,
        ordersFailed: 0,
        totalNotional: 250,
        newMaxDriftPct: 1.2,
      },
    });

    expect(merged.executedOrders).toEqual(["ticket-old", "ticket-dup", "ticket-new"]);
    expect(merged.executionSummary).toEqual({
      ordersExecuted: 3,
      ordersSubmitted: 1,
      ordersFailed: 1,
      totalNotional: 350,
      newMaxDriftPct: 1.2,
    });
  });
});
