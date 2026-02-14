import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  consumeDaaAuthEmailLoginTokenV0,
  createDaaAuthEmailLoginTokenV0,
  findLastDaaAuthEmailLoginTokenCreatedAtV0,
} from "../daaAuthEmailLoginStoreV0";
import { createDaaAuthAccountV0 } from "../daaAuthStoreV0";

const GLOBAL_KEY = "__daa_sqlite_state_v0__";

async function resetDbFile(dbPath: string) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  await rm(dbPath, { force: true });
  await rm(`${dbPath}.tmp`, { force: true });
  delete (globalThis as any)[GLOBAL_KEY];
}

describe("daa/auth email login store v0", () => {
  it("creates + consumes a single-use email login token", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-auth-email-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

    const a1 = await createDaaAuthAccountV0({ username: "user1@example.com", password: "pw-1", roles: ["viewer"] });

    const last0 = await findLastDaaAuthEmailLoginTokenCreatedAtV0({ accountId: a1.accountId });
    expect(last0).toBe(null);

    const { token, row } = await createDaaAuthEmailLoginTokenV0({ accountId: a1.accountId, ttlMinutes: 15, userAgent: "ua", ip: "1.2.3.4" });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
    expect(row.accountId).toBe(a1.accountId);

    const last1 = await findLastDaaAuthEmailLoginTokenCreatedAtV0({ accountId: a1.accountId });
    expect(typeof last1).toBe("string");

    const found1 = await consumeDaaAuthEmailLoginTokenV0({ token, userAgent: "ua2", ip: "5.6.7.8" });
    expect(found1?.account.username).toBe("user1@example.com");
    expect(found1?.session.accountId).toBe(a1.accountId);
    expect(typeof found1?.sessionToken).toBe("string");

    const found2 = await consumeDaaAuthEmailLoginTokenV0({ token, userAgent: "ua2", ip: "5.6.7.8" });
    expect(found2).toBe(null);

    await resetDbFile(dbPath);
  });

  it("rejects an expired token", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-auth-email-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

    const a1 = await createDaaAuthAccountV0({ username: "user2@example.com", password: "pw-2", roles: ["viewer"] });

    const { token } = await createDaaAuthEmailLoginTokenV0({
      accountId: a1.accountId,
      ttlMinutes: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const expired = await consumeDaaAuthEmailLoginTokenV0({ token, now: "2026-01-01T00:10:00.000Z" });
    expect(expired).toBe(null);

    await resetDbFile(dbPath);
  });
});
