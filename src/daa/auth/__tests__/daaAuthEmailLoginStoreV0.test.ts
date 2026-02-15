import { describe, expect, it } from "vitest";

import {
  consumeDaaAuthEmailLoginTokenV0,
  createDaaAuthEmailLoginTokenV0,
  findLastDaaAuthEmailLoginTokenCreatedAtV0,
} from "../daaAuthEmailLoginStoreV0";
import { createDaaAuthAccountV0 } from "../daaAuthStoreV0";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";

function resetPgMem() {
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

describe("daa/auth email login store v0", () => {
  it("creates + consumes a single-use email login token", async () => {
    resetPgMem();

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
  });

  it("rejects an expired token", async () => {
    resetPgMem();

    const a1 = await createDaaAuthAccountV0({ username: "user2@example.com", password: "pw-2", roles: ["viewer"] });

    const { token } = await createDaaAuthEmailLoginTokenV0({
      accountId: a1.accountId,
      ttlMinutes: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const expired = await consumeDaaAuthEmailLoginTokenV0({ token, now: "2026-01-01T00:10:00.000Z" });
    expect(expired).toBe(null);
  });
});
