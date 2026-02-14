import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  appendDaaRunAuditEventV0,
  createDaaRunV0,
  getDaaRunBundleV0,
  listDaaRunsV0,
  setDaaRunConfirmV0,
  setDaaRunExecutedV0,
  setDaaRunPortfolioV0,
} from "../daaSqliteStoreV0";

const GLOBAL_KEY = "__daa_sqlite_state_v0__";

async function resetDbFile(dbPath: string) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  await rm(dbPath, { force: true });
  await rm(`${dbPath}.tmp`, { force: true });
  delete (globalThis as any)[GLOBAL_KEY];
}

describe("daa/sqlite store v0", () => {
  it("persists runs + portfolio/confirm/executed + audit", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

    const { runId } = await createDaaRunV0({ kind: "rebalance", payload: { foo: 1 } });

    await setDaaRunPortfolioV0({ runId, payload: { holdings: [{ symbol: "SPY", qty: 1 }] } });
    await setDaaRunConfirmV0({ runId, payload: { ok: true, note: "user confirmed" } });
    await setDaaRunExecutedV0({ runId, payload: { mode: "paper", fills: [] } });

    const a1 = await appendDaaRunAuditEventV0({ runId, kind: "ai_orders_draft", payload: { orders: [] } });
    await appendDaaRunAuditEventV0({ runId, kind: "note", payload: { text: "hello" } });

    const bundle1 = await getDaaRunBundleV0(runId);
    expect(bundle1.run.runId).toBe(runId);
    expect(bundle1.run.kind).toBe("rebalance");
    expect(bundle1.portfolio?.payload).toEqual({ holdings: [{ symbol: "SPY", qty: 1 }] });
    expect(bundle1.confirm?.payload).toEqual({ ok: true, note: "user confirmed" });
    expect(bundle1.executed?.payload).toEqual({ mode: "paper", fills: [] });
    expect(bundle1.audit.length).toBe(2);
    expect(bundle1.audit[0]?.eventId).toBe(a1.eventId);

    // Prove persistence: drop in-memory cache and reload from disk.
    delete (globalThis as any)[GLOBAL_KEY];

    const bundle2 = await getDaaRunBundleV0(runId);
    expect(bundle2.run.payload).toEqual({ foo: 1 });
    expect(bundle2.audit.map((e) => e.kind)).toEqual(["ai_orders_draft", "note"]);

    await resetDbFile(dbPath);
  });

  it("lists runs with cursor", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

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
    expect(page1[1]?.auditCount).toBe(2);

    const page2 = await listDaaRunsV0({ limit: 10, beforeCreatedAt: page1[1]!.createdAt, beforeRunId: page1[1]!.runId });
    expect(page2.map((r) => r.runId)).toEqual([r1.runId]);
    expect(page2[0]?.hasPortfolio).toBe(true);

    await resetDbFile(dbPath);
  });

  it("lists runs with date range + actor filter", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

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

    await resetDbFile(dbPath);
  });
});
