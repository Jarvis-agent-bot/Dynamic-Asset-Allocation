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
    username: `store-contract-${roles.join("-")}-${suffix}@example.com`,
    password: "pw-1",
    roles,
  });
  const { token } = await createDaaAuthSessionV0({ accountId: account.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });
  return makeCookieHeader(token);
}

describe("/api/daa/store/v0/run/{runId} route contract parity", () => {
  it("enforces viewer auth and preserves missing/not-found status codes", async () => {
    resetPgMem();

    const getRunMod = await import("../../../../app/api/daa/store/v0/run/[runId]/route");

    const unauthorizedReq = new Request("https://example.com/api/daa/store/v0/run/run_missing", { method: "GET" });
    const unauthorizedRes: Response = await (getRunMod as any).GET(unauthorizedReq, { params: { runId: "run_missing" } });
    expect(unauthorizedRes.status).toBe(401);
    await expect(unauthorizedRes.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });

    const viewerCookie = await createSessionCookie(["viewer"]);
    const missingParamReq = new Request("https://example.com/api/daa/store/v0/run/", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const missingParamRes: Response = await (getRunMod as any).GET(missingParamReq, { params: { runId: "" } });
    expect(missingParamRes.status).toBe(400);
    await expect(missingParamRes.json()).resolves.toMatchObject({ ok: false, error: "missing runId" });

    const missingReq = new Request("https://example.com/api/daa/store/v0/run/run_missing", {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const missingRes: Response = await (getRunMod as any).GET(missingReq, { params: { runId: "run_missing" } });
    expect(missingRes.status).toBe(404);
    await expect(missingRes.json()).resolves.toMatchObject({ ok: false, error: "run not found" });

    const created = await createDaaRunV0({
      kind: "rebalance.preview",
      payload: { source: "/daa/dashboard", actor: "dashboard", note: "contract" },
      createdAt: "2026-02-16T08:00:00.000Z",
    });

    const okReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(created.runId)}`, {
      method: "GET",
      headers: { cookie: viewerCookie, accept: "application/json" },
    });
    const okRes: Response = await (getRunMod as any).GET(okReq, { params: { runId: created.runId } });
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.ok).toBe(true);
    expect(okJson.bundle?.run?.runId).toBe(created.runId);
    expect(okJson.bundle?.run?.status).toBe("created");
    expect(okJson.bundle?.run?.payload).toMatchObject({ source: "/daa/dashboard", actor: "dashboard" });
  });

  it("locks editor write-route error status/body contract for missing/not-found runs", async () => {
    resetPgMem();

    const editorCookie = await createSessionCookie(["editor"]);
    const postBody = JSON.stringify({ payload: { source: "/daa/dashboard", actor: "editor" }, kind: "note" });

    const confirmMod = await import("../../../../app/api/daa/store/v0/run/[runId]/confirm/route");
    const executedMod = await import("../../../../app/api/daa/store/v0/run/[runId]/executed/route");
    const portfolioMod = await import("../../../../app/api/daa/store/v0/run/[runId]/portfolio/route");
    const auditMod = await import("../../../../app/api/daa/store/v0/run/[runId]/audit/route");

    const endpoints = [
      { name: "confirm", mod: confirmMod, runId: "" },
      { name: "executed", mod: executedMod, runId: "" },
      { name: "portfolio", mod: portfolioMod, runId: "" },
      { name: "audit", mod: auditMod, runId: "" },
    ];

    for (const ep of endpoints) {
      const req = new Request("https://example.com/api/daa/store/v0/run//x", {
        method: "POST",
        headers: { cookie: editorCookie, "content-type": "application/json" },
        body: postBody,
      });
      const res: Response = await (ep.mod as any).POST(req, { params: { runId: ep.runId } });
      expect(res.status, ep.name).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ ok: false, error: "missing runId" });
    }

    const missingRunEndpoints = [
      { name: "confirm", mod: confirmMod },
      { name: "executed", mod: executedMod },
      { name: "portfolio", mod: portfolioMod },
      { name: "audit", mod: auditMod },
    ];
    for (const ep of missingRunEndpoints) {
      const req = new Request("https://example.com/api/daa/store/v0/run/run_missing/x", {
        method: "POST",
        headers: { cookie: editorCookie, "content-type": "application/json" },
        body: postBody,
      });
      const res: Response = await (ep.mod as any).POST(req, { params: { runId: "run_missing" } });
      expect(res.status, ep.name).toBe(404);
      await expect(res.json()).resolves.toMatchObject({ ok: false, error: "run not found" });
    }
  });
});
