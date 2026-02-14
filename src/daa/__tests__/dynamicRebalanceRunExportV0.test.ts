import { describe, expect, test } from "vitest";

import {
  buildDynamicRebalanceRunAllocationsCsvV0,
  buildDynamicRebalanceRunAuditBundleV0,
  buildDynamicRebalanceRunAuditLogCsvV0,
  buildDynamicRebalanceRunOrdersCsvV0,
} from "../dynamicRebalanceRunExportV0";
import type { RebalanceLogEntryV0 } from "../rebalanceLogStore";
import type { RebalanceOrderStatusRunV0 } from "../rebalanceOrderStatusRunStoreV0";

function run(partial: Partial<RebalanceOrderStatusRunV0> & { runId: string }): RebalanceOrderStatusRunV0 {
  return {
    schemaVersion: 1,
    runId: partial.runId,
    createdAt: partial.createdAt ?? "2026-02-14T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-02-14T00:01:00.000Z",
    state: partial.state ?? "done",
    phase: partial.phase ?? "done",
    message: partial.message,
    error: partial.error,
    orders: partial.orders ?? [],
  };
}

function coreEntry(partial: Partial<RebalanceLogEntryV0> & { id: string; at: string }): RebalanceLogEntryV0 {
  return {
    id: partial.id,
    runId: partial.runId,
    at: partial.at,
    kind: "rebalance",
    source: "core",
    request: partial.request,
    response: partial.response,
    orders: partial.orders ?? [],
    note: partial.note,
  };
}

describe("dynamicRebalanceRunExportV0", () => {
  test("orders CSV escapes commas/quotes/newlines", () => {
    const r = run({
      runId: "rebalance_run_123",
      orders: [
        {
          id: "1",
          symbol: "AAA",
          side: "BUY",
          notional: 12.34,
          status: "filled",
          updatedAt: "2026-02-14T00:01:00.000Z",
          detail: "ok",
        },
        {
          id: "2",
          symbol: "BBB",
          side: "SELL",
          notional: 56.78,
          status: "failed",
          updatedAt: "2026-02-14T00:02:00.000Z",
          detail: "has,comma and \"quote\"\nand newline",
        },
      ],
    });

    const csv = buildDynamicRebalanceRunOrdersCsvV0({ run: r });
    expect(csv).toContain("runId,createdAt,updatedAt,state,phase,orderId,symbol,side,notional,status,orderUpdatedAt,filledNotional,fillPct01,detail\n");
    expect(csv).toContain("rebalance_run_123");

    // Detail field should be quoted and quotes doubled.
    expect(csv).toContain('"has,comma and ""quote""\nand newline"');
  });

  test("audit log CSV includes reason when core log has per-order reasons", () => {
    const r = run({
      runId: "rebalance_run_reason",
      orders: [
        { id: "1", symbol: "AAA", side: "BUY", notional: 10, status: "filled", updatedAt: "2026-02-14T00:01:00.000Z" },
        { id: "2", symbol: "BBB", side: "SELL", notional: 20, status: "failed", updatedAt: "2026-02-14T00:02:00.000Z", detail: "broker rejected" },
      ],
    });

    const entry = coreEntry({
      id: "e_reason",
      at: "2026-02-14T00:00:30.000Z",
      runId: r.runId,
      orders: [
        { symbol: "AAA", side: "BUY", notional: 10, reason: "top up to target" },
        { symbol: "BBB", side: "SELL", notional: 20, reason: "reduce overweight" },
      ],
    });

    const csv = buildDynamicRebalanceRunAuditLogCsvV0({ run: r, coreLogEntry: entry });
    expect(csv).toContain("runId,runCreatedAt,runUpdatedAt,runState,runPhase,runNotes,runTags,coreLoggedAt,orderId,symbol,side,notional,reason,status,orderUpdatedAt,filledNotional,fillPct01,detail\n");
    expect(csv).toContain("rebalance_run_reason");
    expect(csv).toContain("top up to target");
    expect(csv).toContain("reduce overweight");
    expect(csv).toContain("broker rejected");
  });

  test("audit bundle includes derived counts + allocations snapshot when available", () => {
    const r = run({
      runId: "rebalance_run_abc",
      orders: [
        { id: "1", symbol: "AAA", side: "BUY", notional: 1, status: "filled", updatedAt: "2026-02-14T00:01:00.000Z" },
        { id: "2", symbol: "BBB", side: "SELL", notional: 2, status: "failed", updatedAt: "2026-02-14T00:01:00.000Z" },
      ],
    });

    const entry = coreEntry({
      id: "e1",
      at: "2026-02-14T00:01:00.000Z",
      runId: r.runId,
      response: {
        explain: {
          equity: 100,
          currentValues: { AAA: 60, BBB: 40 },
          desiredValues: { AAA: 50, BBB: 50 },
        },
        targetWeights: [
          { id: "AAA", label: "Asset A", targetPct: 0.5 },
          { id: "BBB", label: "Asset B", targetPct: 0.5 },
        ],
      },
    });

    const bundle = buildDynamicRebalanceRunAuditBundleV0({ run: r, coreLogEntry: entry, exportedAt: "2026-02-14T00:02:00.000Z" });
    expect(bundle.derived.ordersTotal).toBe(2);
    expect(bundle.derived.ordersFilled).toBe(1);
    expect(bundle.derived.ordersFailed).toBe(1);
    expect(bundle.derived.allocations?.equity).toBe(100);
    expect(bundle.derived.allocations?.rows.length).toBe(2);
  });

  test("allocations CSV returns null when no allocations info exists", () => {
    const csv = buildDynamicRebalanceRunAllocationsCsvV0({ runId: "r1", coreLogEntry: null });
    expect(csv).toBeNull();
  });
});
