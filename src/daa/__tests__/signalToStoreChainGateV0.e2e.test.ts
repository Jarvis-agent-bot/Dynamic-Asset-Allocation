import { describe, expect, it } from "vitest";

import { rebalanceCore } from "../../core/rebalanceCore";

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
    username: `signal-store-chain-${roles.join("-")}-${suffix}@example.com`,
    password: "pw-1",
    roles,
  });
  const { token } = await createDaaAuthSessionV0({ accountId: account.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });
  return makeCookieHeader(token);
}

describe("signal -> rebalance -> confirm/executed -> store e2e ci gate v0", () => {
  it("blocks executed before confirm, then persists full chain once confirmed", async () => {
    resetPgMem();

    const editorCookie = await createSessionCookie(["editor"]);
    const viewerCookie = await createSessionCookie(["viewer"]);

    const confirmMod = await import("../../../app/api/daa/store/v0/run/[runId]/confirm/route");
    const executedMod = await import("../../../app/api/daa/store/v0/run/[runId]/executed/route");
    const runMod = await import("../../../app/api/daa/store/v0/run/[runId]/route");

    const rebalanceReq = {
      account: { cash: 0 },
      holdings: { AAA: 10 },
      prices: { AAA: 10, BBB: 10 },
      targetWeights: { AAA: 0, BBB: 1 },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0, minTradeNotional: 0, cooldownSeconds: 0 },
    };
    const rebalance = rebalanceCore(rebalanceReq);
    expect(rebalance.trigger.shouldRebalance).toBe(true);

    const signalPayload = {
      money_plan: { regime: "risk-on", rebalanceMode: "full" },
      signals: [{ symbol: "AAA", score: -0.9 }, { symbol: "BBB", score: 0.9 }],
      rebalance,
    };

    const create = await createDaaRunV0({
      kind: "signal_rebalance_v0",
      status: "draft",
      payload: signalPayload,
      actorUserId: "ops-ci-gate",
    });

    const runId = create.runId;

    const executedBeforeConfirmReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(runId)}/executed`, {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          kind: "executed_v0",
          orders: [{ id: "1", status: "submitted", reason: "queued", code: "ACCEPTED" }],
        },
      }),
    });
    const executedBeforeConfirmRes: Response = await (executedMod as any).POST(executedBeforeConfirmReq, { params: { runId } });
    expect(executedBeforeConfirmRes.status).toBe(409);
    await expect(executedBeforeConfirmRes.json()).resolves.toMatchObject({ ok: false, error: "confirm required before executed" });

    const confirmReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(runId)}/confirm`, {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({ payload: { approvedBy: "ops", reason: "signal aligned" } }),
    });
    const confirmRes: Response = await (confirmMod as any).POST(confirmReq, { params: { runId } });
    expect(confirmRes.status).toBe(200);
    await expect(confirmRes.json()).resolves.toMatchObject({ ok: true });

    const executedReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(runId)}/executed`, {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          kind: "executed_v0",
          orders: [
            { id: "1", status: "submitted", reason: "queued", code: "ACCEPTED" },
            { id: "2", status: "filled", reason: "match", code: "FILLED" },
          ],
        },
      }),
    });
    const executedRes: Response = await (executedMod as any).POST(executedReq, { params: { runId } });
    expect(executedRes.status).toBe(200);
    await expect(executedRes.json()).resolves.toMatchObject({ ok: true, statusesSaved: 2 });

    const getRunReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(runId)}`, {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const getRunRes: Response = await (runMod as any).GET(getRunReq, { params: { runId } });
    expect(getRunRes.status).toBe(200);
    const getRunJson = await getRunRes.json();
    expect(getRunJson.ok).toBe(true);
    expect(getRunJson.bundle.run.payload).toEqual(signalPayload);
    expect(getRunJson.bundle.confirm?.payload).toEqual({ approvedBy: "ops", reason: "signal aligned" });
    expect(getRunJson.bundle.executed?.payload).toMatchObject({ kind: "executed_v0" });
    expect(getRunJson.bundle.audit.map((e: any) => e.kind)).toEqual([
      "run_created",
      "confirm_set",
      "executed_set",
      "execution_status_set",
    ]);
  });
});
