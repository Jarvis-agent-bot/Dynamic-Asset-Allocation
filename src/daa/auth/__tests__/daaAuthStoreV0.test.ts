import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  authenticateDaaAuthAccountV0,
  createDaaAuthAccountV0,
  createDaaAuthSessionV0,
  getDaaAuthAccountBySessionTokenV0,
  getDaaAuthAccountByUsernameV0,
  revokeDaaAuthSessionV0,
  verifyPasswordV0,
  hashPasswordV0,
} from "../daaAuthStoreV0";

const GLOBAL_KEY = "__daa_sqlite_state_v0__";

async function resetDbFile(dbPath: string) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  await rm(dbPath, { force: true });
  await rm(`${dbPath}.tmp`, { force: true });
  delete (globalThis as any)[GLOBAL_KEY];
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
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-auth-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

    const a1 = await createDaaAuthAccountV0({ username: "Admin", password: "pw-1", roles: ["editor"] });
    expect(a1.username).toBe("admin");
    expect(a1.roles).toEqual(["editor"]);

    const a2 = await getDaaAuthAccountByUsernameV0("ADMIN");
    expect(a2?.accountId).toBe(a1.accountId);

    const ok = await authenticateDaaAuthAccountV0({ username: "admin", password: "pw-1" });
    expect(ok?.accountId).toBe(a1.accountId);

    const bad = await authenticateDaaAuthAccountV0({ username: "admin", password: "wrong" });
    expect(bad).toBe(null);

    await resetDbFile(dbPath);
  });

  it("creates + verifies + revokes a session", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-auth-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

    const a1 = await createDaaAuthAccountV0({ username: "user1", password: "pw-2", roles: ["viewer"] });

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

    await resetDbFile(dbPath);
  });

  it("rejects an expired session", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-auth-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

    const a1 = await createDaaAuthAccountV0({ username: "user2", password: "pw-3", roles: ["viewer"] });

    const { token } = await createDaaAuthSessionV0({
      accountId: a1.accountId,
      ttlDays: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const ok = await getDaaAuthAccountBySessionTokenV0({ token, now: "2026-01-01T00:00:00.000Z" });
    expect(ok).not.toBe(null);

    const expired = await getDaaAuthAccountBySessionTokenV0({ token, now: "2026-01-02T00:00:00.000Z" });
    expect(expired).toBe(null);

    await resetDbFile(dbPath);
  });
});
