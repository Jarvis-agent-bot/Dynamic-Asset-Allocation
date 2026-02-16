import { describe, expect, it } from "vitest";

import {
  appendDaaAuthAuditEventV0,
  authenticateDaaAuthAccountV0,
  bootstrapCreateFirstDaaAuthAccountV0,
  createDaaAuthAccountV0,
  createDaaAuthSessionV0,
  getDaaAuthAccountBySessionTokenV0,
  getDaaAuthAccountByUsernameV0,
  hasAnyDaaAuthAccountsV0,
  hashPasswordV0,
  listDaaAuthAuditEventsV0,
  revokeDaaAuthSessionV0,
  verifyPasswordV0,
} from "../daaAuthStoreV0";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";

function resetPgMem() {
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

describe("daa/auth store v0", () => {
  it("hashes + verifies passwords", () => {
    const h = hashPasswordV0("pw-123");
    expect(typeof h).toBe("string");
    expect(h.startsWith("scrypt$")).toBe(true);

    expect(verifyPasswordV0("pw-123", h)).toBe(true);
    expect(verifyPasswordV0("pw-124", h)).toBe(false);
  });

  it("creates + authenticates an account", async () => {
    resetPgMem();

    const a1 = await createDaaAuthAccountV0({ username: "Admin@Example.com", password: "pw-1", roles: ["editor"] });
    expect(a1.username).toBe("admin@example.com");
    expect(a1.roles).toEqual(["editor"]);

    const a2 = await getDaaAuthAccountByUsernameV0("ADMIN@EXAMPLE.COM");
    expect(a2?.accountId).toBe(a1.accountId);

    const ok = await authenticateDaaAuthAccountV0({ username: "admin@example.com", password: "pw-1" });
    expect(ok?.accountId).toBe(a1.accountId);

    const bad = await authenticateDaaAuthAccountV0({ username: "admin@example.com", password: "wrong" });
    expect(bad).toBe(null);

    await expect(createDaaAuthAccountV0({ username: "not-an-email", password: "pw-x", roles: ["viewer"] })).rejects.toThrow(/invalid email/i);
  });

  it("bootstraps the first admin only when there are no accounts", async () => {
    resetPgMem();

    expect(await hasAnyDaaAuthAccountsV0()).toBe(false);

    const a1 = await bootstrapCreateFirstDaaAuthAccountV0({
      username: "FirstAdmin@Example.com",
      password: "pw-boot",
      roles: ["viewer"],
    });

    expect(a1.username).toBe("firstadmin@example.com");
    expect(a1.roles.includes("editor")).toBe(true);

    expect(await hasAnyDaaAuthAccountsV0()).toBe(true);

    await expect(bootstrapCreateFirstDaaAuthAccountV0({ username: "admin2@example.com", password: "pw-2" })).rejects.toThrow(
      /bootstrap not allowed|accounts already exist/i,
    );
  });

  it("creates + verifies + revokes a session", async () => {
    resetPgMem();

    const a1 = await createDaaAuthAccountV0({ username: "user1@example.com", password: "pw-2", roles: ["viewer"] });

    const { session, token } = await createDaaAuthSessionV0({ accountId: a1.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });
    expect(session.accountId).toBe(a1.accountId);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);

    const found1 = await getDaaAuthAccountBySessionTokenV0({ token, now: session.createdAt });
    expect(found1?.account.accountId).toBe(a1.accountId);
    expect(found1?.session.sessionId).toBe(session.sessionId);
    expect(found1?.session.lastSeenAt).toBe(session.createdAt);

    const rev = await revokeDaaAuthSessionV0({ sessionId: session.sessionId, revokedAt: session.createdAt });
    expect(rev.ok).toBe(true);

    const found2 = await getDaaAuthAccountBySessionTokenV0({ token, now: session.createdAt });
    expect(found2).toBe(null);
  });

  it("rejects an expired session", async () => {
    resetPgMem();

    const a1 = await createDaaAuthAccountV0({ username: "user2@example.com", password: "pw-3", roles: ["viewer"] });

    const { token } = await createDaaAuthSessionV0({
      accountId: a1.accountId,
      ttlDays: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const ok = await getDaaAuthAccountBySessionTokenV0({ token, now: "2026-01-01T00:00:00.000Z" });
    expect(ok).not.toBe(null);

    const expired = await getDaaAuthAccountBySessionTokenV0({ token, now: "2026-01-02T00:00:00.000Z" });
    expect(expired).toBe(null);
  });

  it("appends and lists auth audit events", async () => {
    resetPgMem();

    const a1 = await createDaaAuthAccountV0({ username: "audit@example.com", password: "pw-4", roles: ["editor"] });
    const { session } = await createDaaAuthSessionV0({ accountId: a1.accountId, ttlDays: 7 });

    await appendDaaAuthAuditEventV0({
      kind: "auth.login.success",
      actorUserId: a1.accountId,
      accountId: a1.accountId,
      sessionId: session.sessionId,
      payload: { ip: "1.1.1.1" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await appendDaaAuthAuditEventV0({
      kind: "auth.logout",
      actorUserId: a1.accountId,
      accountId: a1.accountId,
      sessionId: session.sessionId,
      payload: { reason: "manual" },
      createdAt: "2026-01-01T00:01:00.000Z",
    });

    const rows = await listDaaAuthAuditEventsV0({ actorUserId: a1.accountId, limit: 10 });
    expect(rows.length).toBe(2);
    expect(rows[0]?.kind).toBe("auth.logout");
    expect(rows[0]?.accountId).toBe(a1.accountId);
    expect(rows[0]?.sessionId).toBe(session.sessionId);

    const olderOnly = await listDaaAuthAuditEventsV0({
      beforeCreatedAt: rows[0]?.createdAt,
      beforeEventId: rows[0]?.eventId,
      actorUserId: a1.accountId,
      limit: 10,
    });
    expect(olderOnly.length).toBe(1);
    expect(olderOnly[0]?.kind).toBe("auth.login.success");
  });
});
