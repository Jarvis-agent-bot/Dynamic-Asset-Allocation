import { afterEach, describe, expect, it, vi } from "vitest";

describe("store schema owner scope bootstrap", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete (globalThis as any).__daa_store_pg_state_v0__;
  });

  it("旧表缺少 owner_account_id 时，会先补列再创建 owner 维度索引", async () => {
    delete (globalThis as any).__daa_store_pg_state_v0__;

    let positionsHasOwner = false;
    const calls: string[] = [];

    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push(sql);

      if (sql.includes("information_schema.tables")) {
        const tableName = String(params[0] || "");
        return {
          rows: tableName === "daa_positions_v2" ? [{ ok: 1 }] : [],
          rowCount: tableName === "daa_positions_v2" ? 1 : 0,
        };
      }

      if (sql.includes("information_schema.columns")) {
        const tableName = String(params[0] || "");
        const columnName = String(params[1] || "");
        const hasColumn = tableName === "daa_positions_v2" && columnName === "owner_account_id" && positionsHasOwner;
        return { rows: hasColumn ? [{ ok: 1 }] : [], rowCount: hasColumn ? 1 : 0 };
      }

      if (sql.includes('ALTER TABLE "daa_positions_v2" ADD COLUMN "owner_account_id"')) {
        positionsHasOwner = true;
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes("idx_daa_positions_v2_owner_symbol_market") && !positionsHasOwner) {
        throw new Error('column "owner_account_id" does not exist');
      }

      return { rows: [], rowCount: 0 };
    });

    vi.doMock("@/src/daa/pg/daaPg", () => ({
      daaPgPool: null,
      withDaaPgClient: async (fn: any) => fn({ query }),
    }));
    vi.doMock("@/src/daa/store/accountStore", () => ({
      ensureSystemConfigRowInTx: vi.fn(async () => ({ id: "default", version: 1, config: {}, updatedAt: new Date().toISOString() })),
      ensureAccountStateRowInTx: vi.fn(async () => ({
        id: "default",
        baseCurrency: "USD",
        cash: 0,
        investableCash: 0,
        frozenCash: 0,
        totalEquity: null,
        updatedAt: new Date().toISOString(),
      })),
    }));
    vi.doMock("@/src/daa/store/runtimeMigrations", () => ({
      runDaaStoreRuntimeMigrations: vi.fn(async () => undefined),
    }));

    const { ensureDaaStoreSchemaPg } = await import("@/src/daa/store/storeSchema");

    await expect(ensureDaaStoreSchemaPg()).resolves.toBeUndefined();

    const ownerColumnCallIndex = calls.findIndex((sql) => sql.includes('ALTER TABLE "daa_positions_v2" ADD COLUMN "owner_account_id"'));
    const ownerIndexCallIndex = calls.findIndex((sql) => sql.includes("idx_daa_positions_v2_owner_symbol_market"));

    expect(ownerColumnCallIndex).toBeGreaterThanOrEqual(0);
    expect(ownerIndexCallIndex).toBeGreaterThan(ownerColumnCallIndex);
  });
});
