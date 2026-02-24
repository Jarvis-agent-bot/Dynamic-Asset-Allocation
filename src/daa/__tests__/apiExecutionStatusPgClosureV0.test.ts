import { describe, expect, it } from "vitest";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "../auth/daaAuthConstantsV0";
import { createDaaAuthAccountV0, createDaaAuthSessionV0 } from "../auth/daaAuthStoreV0";
import { createDaaRunV0 } from "../storeV0";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_PG_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMem() {
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

function makeCookieHeader(token: string): string {
  return `${DAA_AUTH_SESSION_COOKIE_V0}=${encodeURIComponent(token)}`;
}

async function createSessionCookie(roles: Array<"viewer" | "editor">): Promise<string> {
  const suffix = Math.random().toString(16).slice(2, 8);
  const account = await createDaaAuthAccountV0({
    username: `exec-status-${roles.join("-")}-${suffix}@example.com`,
    password: "pw-1",
    roles,
  });
  const { token } = await createDaaAuthSessionV0({ accountId: account.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });
  return makeCookieHeader(token);
}

describe("/api/daa/store/v0/run/{runId}/execution-status pg closure v0", () => {
  it("persists submitted/filled/failed status with reason/code and queries by runId", async () => {
    resetPgMem();

    const editorCookie = await createSessionCookie(["editor"]);
    const viewerCookie = await createSessionCookie(["viewer"]);

    const create = await createDaaRunV0({
      kind: "rebalance.execution",
      payload: { source: "/daa/dashboard", actor: "dashboard" },
      createdAt: "2026-02-24T07:58:00.000Z",
    });

    const mod = await import("../../../app/api/daa/store/v0/run/[runId]/execution-status/route");

    const postReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(create.runId)}/execution-status`, {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        statuses: [
          { orderId: "1", status: "submitted", reason: "broker accepted", code: "SUBMITTED" },
          { orderId: "2", status: "filled", reason: "full fill", code: "FILLED" },
          { orderId: "3", status: "failed", reason: "risk blocked", code: "RISK_BLOCK" },
        ],
      }),
    });

    const postRes: Response = await (mod as any).POST(postReq, { params: { runId: create.runId } });
    expect(postRes.status).toBe(200);
    await expect(postRes.json()).resolves.toMatchObject({ ok: true, runId: create.runId, saved: 3 });

    const getReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(create.runId)}/execution-status`, {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });

    const getRes: Response = await (mod as any).GET(getReq, { params: { runId: create.runId } });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.ok).toBe(true);
    expect(getJson.statuses).toHaveLength(3);
    expect(getJson.statuses[2]).toMatchObject({ status: "failed", reason: "risk blocked", code: "RISK_BLOCK" });
  });

  it("auto-persists statuses when /executed payload contains order execution state", async () => {
    resetPgMem();

    const editorCookie = await createSessionCookie(["editor"]);
    const viewerCookie = await createSessionCookie(["viewer"]);

    const create = await createDaaRunV0({
      kind: "rebalance.execution",
      payload: { source: "/daa/market/funds", actor: "market-funds" },
      createdAt: "2026-02-24T08:00:00.000Z",
    });

    const executedMod = await import("../../../app/api/daa/store/v0/run/[runId]/executed/route");
    const statusMod = await import("../../../app/api/daa/store/v0/run/[runId]/execution-status/route");

    const executedReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(create.runId)}/executed`, {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          kind: "executed_v0",
          orders: [
            { id: "a1", status: "submitted", reason: "queued", code: "ACCEPTED" },
            { id: "a2", status: "failed", reason: "rejected", code: "REJECTED" },
          ],
        },
      }),
    });

    const executedRes: Response = await (executedMod as any).POST(executedReq, { params: { runId: create.runId } });
    expect(executedRes.status).toBe(200);
    await expect(executedRes.json()).resolves.toMatchObject({ ok: true, statusesSaved: 2 });

    const getReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(create.runId)}/execution-status`, {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const getRes: Response = await (statusMod as any).GET(getReq, { params: { runId: create.runId } });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderId: "a1", status: "submitted", code: "ACCEPTED" }),
        expect.objectContaining({ orderId: "a2", status: "failed", code: "REJECTED" }),
      ]),
    );
  });
});
