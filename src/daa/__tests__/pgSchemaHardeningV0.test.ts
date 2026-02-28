import { describe, expect, it } from "vitest";

import { ensureDaaAuthSchemaPgV0 } from "../pg/daaPgV0";
import { ensureDaaStoreSchemaPgV0 } from "../pg/daaStorePgV0";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_PG_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgState() {
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete process.env.DAA_PG_MEM;
}

describe("pg schema hardening v0", () => {
  it("auto-falls back to pg-mem for store schema init when DB URL is missing in non-production", async () => {
    resetPgState();
    process.env.NODE_ENV = "test";

    await expect(ensureDaaStoreSchemaPgV0()).resolves.toBeUndefined();
  });

  it("auto-falls back to pg-mem for auth schema init when DB URL is missing in non-production", async () => {
    resetPgState();
    process.env.NODE_ENV = "test";

    await expect(ensureDaaAuthSchemaPgV0()).resolves.toBeUndefined();
  });
});
