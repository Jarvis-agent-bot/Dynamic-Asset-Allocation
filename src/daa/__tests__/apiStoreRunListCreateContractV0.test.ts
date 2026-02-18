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

    const createReqTwo = new Request("https://example.com/api/daa/store/v0/run", {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "rebalance.preview",
        status: "created",
        payload: { source: "/daa/dashboard", actor: "contract-test", tag: "v0-two" },
      }),
    });
    const createResTwo: Response = await (createMod as any).POST(createReqTwo);
    expect(createResTwo.status).toBe(200);

    const createReqThree = new Request("https://example.com/api/daa/store/v0/run", {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "rebalance.preview",
        status: "created",
        payload: { source: "/daa/dashboard", actor: "contract-test", tag: "v0-three" },
      }),
    });
    const createResThree: Response = await (createMod as any).POST(createReqThree);
    expect(createResThree.status).toBe(200);

    const unauthorizedListReq = new Request("https://example.com/api/daa/store/v0/runs?limit=5", { method: "GET" });
    const unauthorizedListRes: Response = await (listMod as any).GET(unauthorizedListReq);
    expect(unauthorizedListRes.status).toBe(401);
    await expect(unauthorizedListRes.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });

    const invalidFromReq = new Request("https://example.com/api/daa/store/v0/runs?fromCreatedAt=not-a-date", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const invalidFromRes: Response = await (listMod as any).GET(invalidFromReq);
    expect(invalidFromRes.status).toBe(400);
    await expect(invalidFromRes.json()).resolves.toMatchObject({ ok: false, error: "invalid fromCreatedAt" });

    const invalidToReq = new Request("https://example.com/api/daa/store/v0/runs?toCreatedAt=not-a-date", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const invalidToRes: Response = await (listMod as any).GET(invalidToReq);
    expect(invalidToRes.status).toBe(400);
    await expect(invalidToRes.json()).resolves.toMatchObject({ ok: false, error: "invalid toCreatedAt" });

    const invalidRangeReq = new Request(
      "https://example.com/api/daa/store/v0/runs?fromCreatedAt=2026-02-01T00:00:00.000Z&toCreatedAt=2026-01-01T00:00:00.000Z",
      {
        method: "GET",
        headers: { cookie: viewerCookie, accept: "application/json" },
      }
    );
    const invalidRangeRes: Response = await (listMod as any).GET(invalidRangeReq);
    expect(invalidRangeRes.status).toBe(400);
    await expect(invalidRangeRes.json()).resolves.toMatchObject({ ok: false, error: "fromCreatedAt must be <= toCreatedAt" });

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

    const minLimitReq = new Request("https://example.com/api/daa/store/v0/runs?limit=0&source=%2Fdaa%2Fdashboard", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const minLimitRes: Response = await (listMod as any).GET(minLimitReq);
    expect(minLimitRes.status).toBe(200);
    const minLimitJson = await minLimitRes.json();
    expect(minLimitJson.ok).toBe(true);
    expect(Array.isArray(minLimitJson.runs)).toBe(true);
    expect(minLimitJson.runs.length).toBe(1);

    const negativeLimitReq = new Request("https://example.com/api/daa/store/v0/runs?limit=-5&source=%2Fdaa%2Fdashboard", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const negativeLimitRes: Response = await (listMod as any).GET(negativeLimitReq);
    expect(negativeLimitRes.status).toBe(200);
    const negativeLimitJson = await negativeLimitRes.json();
    expect(negativeLimitJson.ok).toBe(true);
    expect(Array.isArray(negativeLimitJson.runs)).toBe(true);
    expect(negativeLimitJson.runs.length).toBe(1);

    const fractionalLimitReq = new Request("https://example.com/api/daa/store/v0/runs?limit=2.9&source=%2Fdaa%2Fdashboard", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const fractionalLimitRes: Response = await (listMod as any).GET(fractionalLimitReq);
    expect(fractionalLimitRes.status).toBe(200);
    const fractionalLimitJson = await fractionalLimitRes.json();
    expect(fractionalLimitJson.ok).toBe(true);
    expect(Array.isArray(fractionalLimitJson.runs)).toBe(true);
    expect(fractionalLimitJson.runs.length).toBe(2);

    const invalidLimitReq = new Request("https://example.com/api/daa/store/v0/runs?limit=NaN&source=%2Fdaa%2Fdashboard", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const invalidLimitRes: Response = await (listMod as any).GET(invalidLimitReq);
    expect(invalidLimitRes.status).toBe(200);
    const invalidLimitJson = await invalidLimitRes.json();
    expect(invalidLimitJson.ok).toBe(true);
    expect(Array.isArray(invalidLimitJson.runs)).toBe(true);
    expect(invalidLimitJson.runs.length).toBe(3);

    const blankLimitReq = new Request("https://example.com/api/daa/store/v0/runs?limit=&source=%2Fdaa%2Fdashboard", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const blankLimitRes: Response = await (listMod as any).GET(blankLimitReq);
    expect(blankLimitRes.status).toBe(200);
    const blankLimitJson = await blankLimitRes.json();
    expect(blankLimitJson.ok).toBe(true);
    expect(Array.isArray(blankLimitJson.runs)).toBe(true);
    expect(blankLimitJson.runs.length).toBe(1);
  });
});
