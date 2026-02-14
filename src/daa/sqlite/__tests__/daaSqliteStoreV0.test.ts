import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  appendDaaRunAuditEventV0,
  createDaaRunV0,
  getDaaRunBundleV0,
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
});
