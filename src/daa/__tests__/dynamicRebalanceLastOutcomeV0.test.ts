import { describe, expect, test } from "vitest";

import { computeLastDynamicRebalanceOutcomeV0 } from "../dynamicRebalanceLastOutcomeV0";
import type { DynamicRebalanceSkipLogEntryV0 } from "../dynamicRebalanceSkipLogStoreV0";
import type { RebalanceOrderStatusRunV0 } from "../rebalanceOrderStatusRunStoreV0";

function run(partial: Partial<RebalanceOrderStatusRunV0> & { runId: string; updatedAt: string; state: "done" | "error" }): RebalanceOrderStatusRunV0 {
  return {
    schemaVersion: 1,
    runId: partial.runId,
    createdAt: partial.createdAt ?? partial.updatedAt,
    updatedAt: partial.updatedAt,
    state: partial.state,
    phase: partial.phase ?? (partial.state === "error" ? "error" : "done"),
    message: partial.message,
    error: partial.error,
    orders: partial.orders ?? [],
  };
}

function skip(partial: Partial<DynamicRebalanceSkipLogEntryV0> & { id: string; at: string; kind: "user-cancelled" }): DynamicRebalanceSkipLogEntryV0 {
  return {
    id: partial.id,
    at: partial.at,
    recordedAt: partial.recordedAt ?? partial.at,
    kind: partial.kind,
    title: partial.title ?? "Cancelled",
    detail: partial.detail ?? "User cancelled",
  };
}

describe("computeLastDynamicRebalanceOutcomeV0", () => {
  test("returns null when nothing exists", () => {
    expect(computeLastDynamicRebalanceOutcomeV0({ runs: [], skips: [] })).toBeNull();
  });

  test("prefers the most recent event by timestamp (cancel beats older run)", () => {
    const olderRun = run({ runId: "r1", updatedAt: "2026-02-14T01:00:00.000Z", state: "done" });
    const newerCancel = skip({ id: "s1", at: "2026-02-14T02:00:00.000Z", kind: "user-cancelled" });

    const out = computeLastDynamicRebalanceOutcomeV0({ runs: [olderRun], skips: [newerCancel] });
    expect(out?.kind).toBe("canceled");
    expect(out?.skip?.id).toBe("s1");
  });

  test("marks failure if run is error", () => {
    const r = run({ runId: "r1", updatedAt: "2026-02-14T01:00:00.000Z", state: "error", error: "boom" });
    const out = computeLastDynamicRebalanceOutcomeV0({ runs: [r], skips: [] });
    expect(out?.kind).toBe("failure");
    expect(out?.run?.runId).toBe("r1");
  });

  test("marks failure if run is done but has failed orders", () => {
    const r = run({
      runId: "r1",
      updatedAt: "2026-02-14T01:00:00.000Z",
      state: "done",
      orders: [
        { id: "1", symbol: "AAA", side: "BUY", notional: 1, status: "filled", updatedAt: "2026-02-14T01:00:00.000Z" },
        { id: "2", symbol: "BBB", side: "SELL", notional: 1, status: "failed", updatedAt: "2026-02-14T01:00:00.000Z" },
      ],
    });

    const out = computeLastDynamicRebalanceOutcomeV0({ runs: [r], skips: [] });
    expect(out?.kind).toBe("failure");
    expect(out?.summary?.ordersFailed).toBe(1);
  });

  test("marks success if run is done and no failed orders", () => {
    const r = run({
      runId: "r1",
      updatedAt: "2026-02-14T01:00:00.000Z",
      state: "done",
      orders: [{ id: "1", symbol: "AAA", side: "BUY", notional: 1, status: "filled", updatedAt: "2026-02-14T01:00:00.000Z" }],
    });

    const out = computeLastDynamicRebalanceOutcomeV0({ runs: [r], skips: [] });
    expect(out?.kind).toBe("success");
    expect(out?.summary?.ordersFilled).toBe(1);
  });
});
