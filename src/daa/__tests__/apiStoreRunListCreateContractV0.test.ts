import { describe, expect, it } from "vitest";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "../auth/daaAuthConstantsV0";
import { createDaaAuthAccountV0, createDaaAuthSessionV0 } from "../auth/daaAuthStoreV0";

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
    username: `store-create-list-${roles.join("-")}-${suffix}@example.com`,
    password: "pw-1",
    roles,
  });
  const { token } = await createDaaAuthSessionV0({ accountId: account.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });
  return makeCookieHeader(token);
}

describe("/api/daa/store/v0 run create/list contract parity", () => {
  it("enforces auth and request contract for create route", async () => {
    resetPgMem();

    const createMod = await import("../../../app/api/daa/store/v0/run/route");

    const unauthorizedReq = new Request("https://example.com/api/daa/store/v0/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "rebalance.preview", payload: { source: "/daa/dashboard" } }),
    });
    const unauthorizedRes: Response = await (createMod as any).POST(unauthorizedReq);
    expect(unauthorizedRes.status).toBe(401);
    await expect(unauthorizedRes.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });

    const editorCookie = await createSessionCookie(["editor"]);

    const invalidJsonReq = new Request("https://example.com/api/daa/store/v0/run", {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: "{",
    });
    const invalidJsonRes: Response = await (createMod as any).POST(invalidJsonReq);
    expect(invalidJsonRes.status).toBe(400);
    await expect(invalidJsonRes.json()).resolves.toMatchObject({ ok: false, error: "invalid json" });

    const missingKindReq = new Request("https://example.com/api/daa/store/v0/run", {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({ payload: { source: "/daa/dashboard" } }),
    });
    const missingKindRes: Response = await (createMod as any).POST(missingKindReq);
    expect(missingKindRes.status).toBe(400);
    await expect(missingKindRes.json()).resolves.toMatchObject({ ok: false, error: "missing kind" });
  });

  it("creates and lists runs with bounded limit + optional filters", async () => {
    resetPgMem();

    const createMod = await import("../../../app/api/daa/store/v0/run/route");
    const listMod = await import("../../../app/api/daa/store/v0/runs/route");

    const editorCookie = await createSessionCookie(["editor"]);
    const viewerCookie = await createSessionCookie(["viewer"]);

    const createReq = new Request("https://example.com/api/daa/store/v0/run", {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "rebalance.preview",
        status: "created",
        payload: { source: "/daa/dashboard", actor: "contract-test", tag: "v0" },
      }),
    });
    const createRes: Response = await (createMod as any).POST(createReq);
    expect(createRes.status).toBe(200);
    const createJson = await createRes.json();
    expect(createJson.ok).toBe(true);
    expect(typeof createJson.runId).toBe("string");
    expect(createJson.runId.length).toBeGreaterThan(0);

    const unauthorizedListReq = new Request("https://example.com/api/daa/store/v0/runs?limit=5", { method: "GET" });
    const unauthorizedListRes: Response = await (listMod as any).GET(unauthorizedListReq);
    expect(unauthorizedListRes.status).toBe(401);
    await expect(unauthorizedListRes.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });

    const listReq = new Request("https://example.com/api/daa/store/v0/runs?limit=999&source=%2Fdaa%2Fdashboard&status=created", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const listRes: Response = await (listMod as any).GET(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.ok).toBe(true);
    expect(Array.isArray(listJson.runs)).toBe(true);
    expect(listJson.runs.length).toBeGreaterThan(0);
    expect(listJson.runs.length).toBeLessThanOrEqual(200);

    const createdRun = listJson.runs.find((run: any) => run.runId === createJson.runId);
    expect(createdRun).toBeTruthy();
    expect(createdRun.kind).toBe("rebalance.preview");
    expect(createdRun.status).toBe("created");
    expect(createdRun.source).toBe("/daa/dashboard");
    expect(createdRun.actor).toBe("contract-test");
  });
});
