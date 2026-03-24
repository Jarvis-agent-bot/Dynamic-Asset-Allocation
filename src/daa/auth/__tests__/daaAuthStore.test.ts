import { afterEach, describe, expect, it, vi } from "vitest";

import { resetPgMemRuntime } from "@/src/daa/__tests__/pgMemTestUtils";
import {
  appendDaaAuthAuditEvent,
  authenticateDaaAuthAccount,
  bootstrapCreateFirstDaaAuthAccount,
  createDaaAuthAccount,
  createDaaAuthSession,
  ensureDevDefaultDaaAuthAccount,
  getDaaAuthAccountBySessionToken,
  getDaaAuthAccountByUsername,
  hasAnyDaaAuthAccounts,
  hashPassword,
  listDaaAuthAuditEvents,
  revokeDaaAuthSession,
  refreshDaaAuthSession,
  verifyPassword,
} from "../daaAuthStore";

describe("daa/auth store v0", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hashes + verifies passwords", () => {
    const h = hashPassword("pw-123");
    expect(typeof h).toBe("string");
    expect(h.startsWith("scrypt$")).toBe(true);

    expect(verifyPassword("pw-123", h)).toBe(true);
    expect(verifyPassword("pw-124", h)).toBe(false);
  });

  it("creates + authenticates an account", async () => {
    resetPgMemRuntime();

    const a1 = await createDaaAuthAccount({ username: "Admin", password: "pw-1", roles: ["editor"] });
    expect(a1.username).toBe("admin");
    expect(a1.roles).toEqual(["editor"]);

    const a2 = await getDaaAuthAccountByUsername("ADMIN");
    expect(a2?.accountId).toBe(a1.accountId);

    const ok = await authenticateDaaAuthAccount({ username: "admin", password: "pw-1" });
    expect(ok?.accountId).toBe(a1.accountId);

    const bad = await authenticateDaaAuthAccount({ username: "admin", password: "wrong" });
    expect(bad).toBe(null);

    await expect(createDaaAuthAccount({ username: "bad username", password: "pw-x", roles: ["viewer"] })).rejects.toThrow(/invalid username/i);
  });

  it("allows creating an account without providing a password", async () => {
    resetPgMemRuntime();

    const a1 = await createDaaAuthAccount({ username: "temp-user", roles: ["viewer"] });
    expect(a1.username).toBe("temp-user");

    const auth = await authenticateDaaAuthAccount({ username: "temp-user", password: "any-value" });
    expect(auth).toBe(null);
  });

  it("bootstraps the first admin only when there are no accounts", async () => {
    resetPgMemRuntime();

    expect(await hasAnyDaaAuthAccounts()).toBe(false);

    const a1 = await bootstrapCreateFirstDaaAuthAccount({
      username: "FirstAdmin@Example.com",
      password: "pw-boot",
      roles: ["viewer"],
    });

    expect(a1.username).toBe("firstadmin@example.com");
    expect(a1.roles.includes("editor")).toBe(true);

    expect(await hasAnyDaaAuthAccounts()).toBe(true);

    await expect(bootstrapCreateFirstDaaAuthAccount({ username: "admin2@example.com", password: "pw-2" })).rejects.toThrow(
      /bootstrap not allowed|accounts already exist/i,
    );
  });

  it("auto-bootstraps deterministic default admin in non-production", async () => {
    resetPgMemRuntime();

    vi.stubEnv("NODE_ENV", "test");
    delete process.env.DAA_AUTH_DEV_DEFAULT_ACCOUNT;
    delete process.env.DAA_AUTH_DEV_DEFAULT_USERNAME;
    delete process.env.DAA_AUTH_DEV_DEFAULT_PASSWORD;

    const result = await ensureDevDefaultDaaAuthAccount();
    expect(result.created).toBe(true);
    expect(result.account?.username).toBe("admin");

    const auth = await authenticateDaaAuthAccount({ username: "admin", password: "admin123" });
    expect(auth?.username).toBe("admin");
  });

  it("creates + verifies + revokes a session", async () => {
    resetPgMemRuntime();

    const a1 = await createDaaAuthAccount({ username: "user1@example.com", password: "pw-2", roles: ["viewer"] });

    const { session, token } = await createDaaAuthSession({ accountId: a1.accountId, ttlDays: 7, userAgent: "ua", ip: "1.2.3.4" });
    expect(session.accountId).toBe(a1.accountId);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);

    const found1 = await getDaaAuthAccountBySessionToken({ token, now: session.createdAt });
    expect(found1?.account.accountId).toBe(a1.accountId);
    expect(found1?.session.sessionId).toBe(session.sessionId);
    expect(found1?.session.lastSeenAt).toBe(session.createdAt);

    const rev = await revokeDaaAuthSession({ sessionId: session.sessionId, revokedAt: session.createdAt });
    expect(rev.ok).toBe(true);

    const found2 = await getDaaAuthAccountBySessionToken({ token, now: session.createdAt });
    expect(found2).toBe(null);
  });

  it("rejects an expired session", async () => {
    resetPgMemRuntime();

    const a1 = await createDaaAuthAccount({ username: "user2@example.com", password: "pw-3", roles: ["viewer"] });

    const { token } = await createDaaAuthSession({
      accountId: a1.accountId,
      ttlDays: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const ok = await getDaaAuthAccountBySessionToken({ token, now: "2026-01-01T00:00:00.000Z" });
    expect(ok).not.toBe(null);

    const expired = await getDaaAuthAccountBySessionToken({ token, now: "2026-01-02T00:00:00.000Z" });
    expect(expired).toBe(null);
  });

  it("refreshes session expiry and last seen via postgres", async () => {
    resetPgMemRuntime();

    const a1 = await createDaaAuthAccount({ username: "user3@example.com", password: "pw-5", roles: ["viewer"] });

    const { session, token } = await createDaaAuthSession({
      accountId: a1.accountId,
      ttlDays: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const refreshed = await refreshDaaAuthSession({
      sessionId: session.sessionId,
      now: "2026-01-01T12:00:00.000Z",
      ttlDays: 7,
    });

    expect(refreshed).not.toBe(null);
    expect(refreshed?.lastSeenAt).toBe("2026-01-01T12:00:00.000Z");
    expect(refreshed?.expiresAt).toBe("2026-01-08T12:00:00.000Z");

    const stillValid = await getDaaAuthAccountBySessionToken({ token, now: "2026-01-05T00:00:00.000Z", touch: false });
    expect(stillValid).not.toBe(null);
  });

  it("appends and lists auth audit events", async () => {
    resetPgMemRuntime();

    const a1 = await createDaaAuthAccount({ username: "audit@example.com", password: "pw-4", roles: ["editor"] });
    const { session } = await createDaaAuthSession({ accountId: a1.accountId, ttlDays: 7 });

    await appendDaaAuthAuditEvent({
      kind: "auth.login.success",
      actorUserId: a1.accountId,
      accountId: a1.accountId,
      sessionId: session.sessionId,
      payload: { ip: "1.1.1.1" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await appendDaaAuthAuditEvent({
      kind: "auth.logout",
      actorUserId: a1.accountId,
      accountId: a1.accountId,
      sessionId: session.sessionId,
      payload: { reason: "manual" },
      createdAt: "2026-01-01T00:01:00.000Z",
    });

    const rows = await listDaaAuthAuditEvents({ actorUserId: a1.accountId, limit: 10 });
    expect(rows.length).toBe(2);
    expect(rows[0]?.kind).toBe("auth.logout");
    expect(rows[0]?.accountId).toBe(a1.accountId);
    expect(rows[0]?.sessionId).toBe(session.sessionId);

    const olderOnly = await listDaaAuthAuditEvents({
      beforeCreatedAt: rows[0]?.createdAt,
      beforeEventId: rows[0]?.eventId,
      actorUserId: a1.accountId,
      limit: 10,
    });
    expect(olderOnly.length).toBe(1);
    expect(olderOnly[0]?.kind).toBe("auth.login.success");
  });
});
