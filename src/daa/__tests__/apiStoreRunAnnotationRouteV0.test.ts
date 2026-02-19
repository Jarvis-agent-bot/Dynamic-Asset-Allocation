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
    username: `store-annotation-${roles.join("-")}-${suffix}@example.com`,
    password: "pw-1",
    roles,
  });
  const { token } = await createDaaAuthSessionV0({ accountId: account.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });
  return makeCookieHeader(token);
}

describe("/api/daa/store/v0/run/[runId]/annotation", () => {
  it("creates run annotations and persists them as audit events", async () => {
    resetPgMem();

    const createMod = await import("../../../app/api/daa/store/v0/run/route");
    const annotationMod = await import("../../../app/api/daa/store/v0/run/[runId]/annotation/route");
    const getRunMod = await import("../../../app/api/daa/store/v0/run/[runId]/route");

    const editorCookie = await createSessionCookie(["editor"]);

    const createReq = new Request("https://example.com/api/daa/store/v0/run", {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "rebalance.preview", status: "created", payload: { source: "/daa/dashboard", actor: "annotation-test" } }),
    });
    const createRes: Response = await (createMod as any).POST(createReq);
    const createJson = await createRes.json();
    expect(createRes.status).toBe(200);
    expect(createJson.ok).toBe(true);

    const runId = String(createJson.runId ?? "");
    expect(runId.length).toBeGreaterThan(0);

    const badReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(runId)}/annotation`, {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({ notes: "", tags: [] }),
    });
    const badRes: Response = await (annotationMod as any).POST(badReq, { params: { runId } });
    expect(badRes.status).toBe(400);
    await expect(badRes.json()).resolves.toMatchObject({ ok: false, error: "notes or tags required" });

    const okReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(runId)}/annotation`, {
      method: "POST",
      headers: { cookie: editorCookie, "content-type": "application/json" },
      body: JSON.stringify({ notes: "manual override approved", tags: ["incident", "INCIDENT", "ops"] }),
    });
    const okRes: Response = await (annotationMod as any).POST(okReq, { params: { runId } });
    expect(okRes.status).toBe(200);
    await expect(okRes.json()).resolves.toMatchObject({ ok: true });

    const getReq = new Request(`https://example.com/api/daa/store/v0/run/${encodeURIComponent(runId)}`, {
      method: "GET",
      headers: { cookie: editorCookie, accept: "application/json" },
    });
    const getRes: Response = await (getRunMod as any).GET(getReq, { params: { runId } });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.ok).toBe(true);

    const annotationEvent = (getJson.bundle?.audit ?? []).find((e: any) => e?.kind === "run_annotation_v0");
    expect(annotationEvent).toBeTruthy();
    expect(annotationEvent.payload).toEqual({ notes: "manual override approved", tags: ["incident", "ops"] });
  });
});
