import { describe, expect, it } from "vitest";

import { runDaaStoreRuntimeMigrations } from "@/src/daa/store/runtimeMigrations";

describe("runtime-migrations-v1", () => {
  it("会把 ledger reset 的 Date 值标准化为 ISO 后再参与 opening balance 回填查询", async () => {
    const capturedTsValues: unknown[] = [];
    const ledgerResetDate = new Date("2026-03-18T16:00:00.000Z");
    const applied = new Set<string>();

    const query = async <Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const result = (() => {
      if (sql.includes("CREATE TABLE IF NOT EXISTS daa_schema_migrations_v1")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id FROM daa_schema_migrations_v1")) {
        const id = String(params[0] || "");
        return { rows: applied.has(id) ? [{ id }] : [], rowCount: applied.has(id) ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO daa_schema_migrations_v1")) {
        applied.add(String(params[0] || ""));
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT 1 FROM information_schema.tables WHERE table_name = $1")) {
        const tableName = String(params[0] || "");
        return { rows: tableName === "daa_portfolio_ledger_events" ? [{ ok: 1 }] : [], rowCount: tableName === "daa_portfolio_ledger_events" ? 1 : 0 };
      }
      if (sql.includes("SELECT MAX(ts) AS ledger_start_ts FROM daa_portfolio_ledger_events")) {
        return { rows: [{ ledger_start_ts: ledgerResetDate }], rowCount: 1 };
      }
      if (
        sql.includes("WHERE event_kind = 'opening_balance' AND ts >= $1")
        || sql.includes("SELECT cash FROM daa_equity_snapshots_v2 WHERE ts = $1")
        || sql.includes("WHERE event_kind <> 'ledger_reset' AND ts >= $1")
      ) {
        capturedTsValues.push(params[0]);
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT base_currency, cash, frozen_cash, investable_cash FROM daa_account_state_v2")) {
        return { rows: [{ base_currency: "USD", cash: 1200, frozen_cash: 0, investable_cash: 1200 }], rowCount: 1 };
      }
      if (sql.includes("SELECT COUNT(*) AS count FROM daa_portfolio_positions")) {
        return { rows: [{ count: 0 }], rowCount: 1 };
      }
      if (sql.includes("UPDATE daa_account_state_v2")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO daa_portfolio_ledger_events")) {
        capturedTsValues.push(params[1]);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
      })();
      return {
        rows: result.rows as unknown as Row[],
        rowCount: result.rowCount,
      };
    };

    await runDaaStoreRuntimeMigrations(query);

    expect(capturedTsValues.length).toBeGreaterThan(0);
    for (const value of capturedTsValues) {
      expect(value).toBe("2026-03-18T16:00:00.000Z");
    }
  });

  it("为 raw payload 的 provider/resource/fetched_at 扫描补充索引", async () => {
    const statements: string[] = [];
    const applied = new Set<string>();

    const query = async <Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      statements.push(sql);
      if (sql.includes("CREATE TABLE IF NOT EXISTS daa_schema_migrations_v1")) {
        return { rows: [] as Row[], rowCount: 0 };
      }
      if (sql.includes("SELECT id FROM daa_schema_migrations_v1")) {
        const id = String(params[0] || "");
        return { rows: (applied.has(id) ? [{ id }] : []) as unknown as Row[], rowCount: applied.has(id) ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO daa_schema_migrations_v1")) {
        applied.add(String(params[0] || ""));
        return { rows: [] as Row[], rowCount: 1 };
      }
      if (sql.includes("SELECT 1 FROM information_schema.tables WHERE table_name = $1")) {
        const tableName = String(params[0] || "");
        return { rows: (tableName === "daa_external_payload_raw_v1" ? [{ ok: 1 }] : []) as unknown as Row[], rowCount: tableName === "daa_external_payload_raw_v1" ? 1 : 0 };
      }
      return { rows: [] as Row[], rowCount: 0 };
    };

    await runDaaStoreRuntimeMigrations(query);

    expect(statements.join("\n")).toContain(
      "idx_daa_external_payload_raw_v1_provider_resource_fetched",
    );
    expect(statements.join("\n")).toContain(
      "ON daa_external_payload_raw_v1(provider, resource, fetched_at DESC)",
    );
  });
});
