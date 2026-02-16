import { describe, expect, it } from "vitest";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "../auth/daaAuthConstantsV0";
import {
  appendDaaAuthAuditEventV0,
  createDaaAuthAccountV0,
  createDaaAuthSessionV0,
} from "../auth/daaAuthStoreV0";
import { appendDaaRunAuditEventV0, createDaaRunV0 } from "../storeV0";

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

describe("/api/daa/store/v0/audit-events route v0", () => {
  it("returns a merged admin feed for source=all", async () => {
    resetPgMem();

    const admin = await createDaaAuthAccountV0({ username: "audit-feed@example.com", password: "pw-1", roles: ["editor"] });
    const { token } = await createDaaAuthSessionV0({ accountId: admin.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });

    const run = await createDaaRunV0({
      kind: "rebalance.preview",
      payload: { source: "ui", actor: "editor" },
      createdAt: "2026-02-16T04:00:00.000Z",
      actorUserId: "editor-token",
    });

    await appendDaaRunAuditEventV0({
      runId: run.runId,
      kind: "note",
      payload: { note: "run event" },
      createdAt: "2026-02-16T04:00:01.000Z",
      actorUserId: "editor-token",
    });

    await appendDaaAuthAuditEventV0({
      kind: "session_login",
      actorUserId: "editor-token",
      accountId: admin.accountId,
      payload: { note: "auth event" },
      createdAt: "2026-02-16T04:00:02.000Z",
    });

    const mod = await import("../../../../app/api/daa/store/v0/audit-events/route");
    const req = new Request("https://example.com/api/daa/store/v0/audit-events?source=all&limit=10", {
      method: "GET",
      headers: {
        cookie: makeCookieHeader(token),
        accept: "application/json",
      },
    });

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(200);

    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(Array.isArray(j.events)).toBe(true);

    const scopes = new Set((j.events as any[]).map((e) => String(e?.payload?.scope ?? "")));
    expect(scopes.has("run")).toBe(true);
    expect(scopes.has("auth")).toBe(true);

    const created = (j.events as any[]).map((e) => String(e.createdAt ?? ""));
    const sorted = [...created].sort((a, b) => b.localeCompare(a));
    expect(created).toEqual(sorted);
  });
});
