import { describe, expect, it } from "vitest";

import {
  appendDaaRunAuditEventV0,
  createDaaRunV0,
  getDaaRunBundleV0,
  listDaaRunAuditEventsV0,
  listDaaRunsV0,
  setDaaRunConfirmV0,
  setDaaRunExecutedV0,
  setDaaRunPortfolioV0,
} from "../storeV0";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_PG_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMem() {
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

describe("daa/store v0 (pg)", () => {
  it("persists runs + portfolio/confirm/executed + audit", async () => {
    resetPgMem();

    const { runId } = await createDaaRunV0({ kind: "rebalance", payload: { foo: 1 }, createdAt: "2026-01-01T00:00:01.000Z" });

    await setDaaRunPortfolioV0({ runId, payload: { holdings: [{ symbol: "SPY", qty: 1 }] }, createdAt: "2026-01-01T00:00:02.000Z" });
    await setDaaRunConfirmV0({ runId, payload: { ok: true, note: "user confirmed" }, createdAt: "2026-01-01T00:00:03.000Z" });
    await setDaaRunExecutedV0({ runId, payload: { mode: "paper", fills: [] }, createdAt: "2026-01-01T00:00:04.000Z" });

    const a1 = await appendDaaRunAuditEventV0({ runId, kind: "ai_orders_draft", payload: { orders: [] }, createdAt: "2026-01-01T00:00:05.000Z" });
    await appendDaaRunAuditEventV0({ runId, kind: "note", payload: { text: "hello" }, createdAt: "2026-01-01T00:00:06.000Z" });

    const bundle1 = await getDaaRunBundleV0(runId);
    expect(bundle1.run.runId).toBe(runId);
    expect(bundle1.run.kind).toBe("rebalance");
    expect(bundle1.portfolio?.payload).toEqual({ holdings: [{ symbol: "SPY", qty: 1 }] });
    expect(bundle1.confirm?.payload).toEqual({ ok: true, note: "user confirmed" });
    expect(bundle1.executed?.payload).toEqual({ mode: "paper", fills: [] });
    expect(bundle1.audit.length).toBe(5);
    expect(bundle1.audit.some((e) => e.eventId === a1.eventId)).toBe(true);

    expect(bundle1.audit.map((e) => e.kind)).toEqual(["run_created", "confirm_set", "executed_set", "ai_orders_draft", "note"]);
  });

  it("lists runs with cursor", async () => {
    resetPgMem();

    const r1 = await createDaaRunV0({ kind: "rebalance", payload: { i: 1 }, createdAt: "2026-01-01T00:00:01.000Z" });
    const r2 = await createDaaRunV0({ kind: "rebalance", payload: { i: 2 }, createdAt: "2026-01-02T00:00:01.000Z" });
    const r3 = await createDaaRunV0({ kind: "rebalance", payload: { i: 3 }, createdAt: "2026-01-03T00:00:01.000Z" });

    await setDaaRunPortfolioV0({ runId: r1.runId, payload: { p: 1 } });
    await setDaaRunConfirmV0({ runId: r2.runId, payload: { c: 2 } });
    await setDaaRunExecutedV0({ runId: r3.runId, payload: { e: 3 } });

    await appendDaaRunAuditEventV0({ runId: r2.runId, kind: "note", payload: { text: "hello" } });
    await appendDaaRunAuditEventV0({ runId: r2.runId, kind: "ai_orders_draft", payload: { orders: [] } });

    const page1 = await listDaaRunsV0({ limit: 2 });
    expect(page1.map((r) => r.runId)).toEqual([r3.runId, r2.runId]);
    expect(page1[0]?.hasExecuted).toBe(true);
    expect(page1[0]?.hasConfirm).toBe(false);
    expect(page1[1]?.hasConfirm).toBe(true);
    expect(page1[1]?.auditCount).toBe(4);

    const page2 = await listDaaRunsV0({ limit: 10, beforeCreatedAt: page1[1]!.createdAt, beforeRunId: page1[1]!.runId });
    expect(page2.map((r) => r.runId)).toEqual([r1.runId]);
    expect(page2[0]?.hasPortfolio).toBe(true);
  });

  it("lists runs with date range + actor filter", async () => {
    resetPgMem();

    const r1 = await createDaaRunV0({
      kind: "rebalance",
      payload: { source: "/daa/dashboard" },
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    const r2 = await createDaaRunV0({
      kind: "rebalance",
      payload: { actor: "market-funds", source: "/daa/market/funds" },
      createdAt: "2026-01-02T00:00:01.000Z",
    });
    const r3 = await createDaaRunV0({
      kind: "rebalance",
      payload: { foo: 3 },
      createdAt: "2026-02-01T00:00:01.000Z",
    });

    const dashOnly = await listDaaRunsV0({ limit: 50, actor: "dashboard" });
    expect(dashOnly.map((r) => r.runId)).toEqual([r1.runId]);

    const janRange = await listDaaRunsV0({
      limit: 50,
      fromCreatedAt: "2026-01-01T00:00:00.000Z",
      toCreatedAt: "2026-01-31T23:59:59.999Z",
    });
    expect(janRange.map((r) => r.runId)).toEqual([r2.runId, r1.runId]);

    const janMarketFunds = await listDaaRunsV0({
      limit: 50,
      actor: "market-funds",
      fromCreatedAt: "2026-01-01T00:00:00.000Z",
      toCreatedAt: "2026-01-31T23:59:59.999Z",
    });
    expect(janMarketFunds.map((r) => r.runId)).toEqual([r2.runId]);

    // Sanity: r3 is outside the range.
    expect(janRange.some((r) => r.runId === r3.runId)).toBe(false);
  });

  it("lists runs with status + source filters", async () => {
    resetPgMem();

    const draftDashboard = await createDaaRunV0({
      kind: "rebalance",
      status: "draft",
      payload: { source: "/daa/dashboard" },
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    const draftFunds = await createDaaRunV0({
      kind: "rebalance",
      status: "draft",
      payload: { source: "/daa/market/funds" },
      createdAt: "2026-01-02T00:00:01.000Z",
    });
    const confirmedDashboard = await createDaaRunV0({
      kind: "rebalance",
      status: "confirmed",
      payload: { source: "/daa/dashboard" },
      createdAt: "2026-01-03T00:00:01.000Z",
    });

    const draftOnly = await listDaaRunsV0({ limit: 50, status: "draft" });
    expect(draftOnly.map((r) => r.runId)).toEqual([draftFunds.runId, draftDashboard.runId]);

    const dashboardOnly = await listDaaRunsV0({ limit: 50, source: "/daa/dashboard" });
    expect(dashboardOnly.map((r) => r.runId)).toEqual([confirmedDashboard.runId, draftDashboard.runId]);

    const draftDashboardOnly = await listDaaRunsV0({
      limit: 50,
      status: "draft",
      source: "/daa/dashboard",
    });
    expect(draftDashboardOnly.map((r) => r.runId)).toEqual([draftDashboard.runId]);
  });

  it("lists audit events with actorUserId filter", async () => {
    resetPgMem();

    const a = await createDaaRunV0({ kind: "rebalance", payload: { foo: 1 }, actorUserId: "editor-token", createdAt: "2026-01-01T00:00:01.000Z" });
    const b = await createDaaRunV0({ kind: "rebalance", payload: { foo: 2 }, actorUserId: "viewer-token", createdAt: "2026-01-02T00:00:01.000Z" });

    await setDaaRunConfirmV0({ runId: a.runId, payload: { ok: true }, actorUserId: "editor-token", createdAt: "2026-01-01T00:00:02.000Z" });
    await appendDaaRunAuditEventV0({ runId: a.runId, kind: "note", payload: { text: "hi" }, actorUserId: "editor-token", createdAt: "2026-01-01T00:00:03.000Z" });

    await appendDaaRunAuditEventV0({ runId: b.runId, kind: "note", payload: { text: "hello" }, actorUserId: "viewer-token", createdAt: "2026-01-02T00:00:02.000Z" });

    const editorOnly = await listDaaRunAuditEventsV0({ limit: 50, actorUserId: "editor-token" });
    expect(editorOnly.every((e) => e.actorUserId === "editor-token")).toBe(true);
    expect(editorOnly.some((e) => e.runId === a.runId)).toBe(true);
    expect(editorOnly.some((e) => e.runId === b.runId)).toBe(false);

    const bundle = await getDaaRunBundleV0(a.runId);
    expect(bundle.audit.some((e) => e.actorUserId === "editor-token")).toBe(true);
  });
});
