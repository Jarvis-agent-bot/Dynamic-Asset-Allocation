import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SYSTEM_CONFIG_ } from "@/src/daa/config/systemConfig";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import {
  appendDaaCashLedgerEntry,
  getDaaSystemConfig,
  listDaaCashLedgerEntries,
  saveDaaSystemConfig,
} from "@/src/daa/store/daaStorePg";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntime() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as Record<string, unknown>)[PG_GLOBAL_KEY];
  delete (globalThis as Record<string, unknown>)[STORE_GLOBAL_KEY];
}

describe("system-config-cas-v1", () => {
  beforeEach(() => {
    resetPgMemRuntime();
  });

  it("旧 schema 缺少 cash ledger 新列时会重新执行 schema ensure", async () => {
    await withDaaPgClient(async ({ query }) => {
      await query(`
        CREATE TABLE daa_asset_universe (
          asset_key TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL DEFAULT 'US',
          currency TEXT NOT NULL DEFAULT 'USD',
          asset_class TEXT NOT NULL DEFAULT 'EQUITY',
          region TEXT NOT NULL DEFAULT 'GLOBAL',
          exchange TEXT NOT NULL DEFAULT '',
          instrument_type TEXT NOT NULL DEFAULT 'STOCK',
          market_group TEXT NOT NULL DEFAULT 'GLOBAL_EQUITY',
          holding_qty NUMERIC NOT NULL DEFAULT 0,
          holding_price NUMERIC NOT NULL DEFAULT 0,
          cost_basis NUMERIC,
          holding_tags TEXT[] NOT NULL DEFAULT '{}',
          watch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          target_weight_hint NUMERIC NOT NULL DEFAULT 0,
          watch_tags TEXT[] NOT NULL DEFAULT '{}',
          notes TEXT,
          last_price NUMERIC NOT NULL DEFAULT 0,
          price_updated_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE daa_trade_tickets (
          ticket_id TEXT PRIMARY KEY,
          basket_id TEXT NOT NULL,
          asset_key TEXT NOT NULL,
          cycle_id TEXT,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL DEFAULT 'US',
          instrument_currency TEXT NOT NULL DEFAULT 'USD',
          base_currency TEXT NOT NULL DEFAULT 'USD',
          side TEXT NOT NULL,
          qty NUMERIC NOT NULL,
          price NUMERIC NOT NULL,
          fee NUMERIC NOT NULL DEFAULT 0,
          gross_notional NUMERIC NOT NULL,
          fx_rate_to_base NUMERIC,
          notional_in_base NUMERIC NOT NULL,
          decision_ref_id TEXT,
          reason_tags TEXT[] NOT NULL DEFAULT '{}',
          reason_text TEXT,
          snapshot_before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          snapshot_after_json JSONB,
          reject_code TEXT,
          reject_message TEXT,
          pricing_mode TEXT NOT NULL DEFAULT 'manual',
          price_source TEXT,
          price_snapshot_at TIMESTAMPTZ,
          created_by TEXT NOT NULL DEFAULT 'admin',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          executed_at TIMESTAMPTZ,
          canceled_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE daa_cash_ledger (
          id TEXT PRIMARY KEY,
          ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          side TEXT NOT NULL,
          amount NUMERIC NOT NULL,
          base_currency TEXT NOT NULL,
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    });

    (globalThis as Record<string, unknown>)[STORE_GLOBAL_KEY] = {
      schemaInit: Promise.resolve(),
      marketCacheSchemaInit: null,
    };

    await expect(listDaaCashLedgerEntries(10)).resolves.toEqual([]);

    await withDaaPgClient(async ({ query }) => {
      const columns = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'daa_cash_ledger'`,
      );
      const names = new Set(columns.rows.map((row) => String((row as Record<string, unknown>).column_name)));
      expect(names.has("ticket_id")).toBe(true);
      expect(names.has("cycle_id")).toBe(true);
      expect(names.has("settlement_ts")).toBe(true);
      expect(names.has("entry_kind")).toBe(true);
    });
  });

  it("相同 baseVersion 并发保存时只允许一个成功", async () => {
    const current = await getDaaSystemConfig();

    const results = await Promise.allSettled([
      saveDaaSystemConfig({
        baseVersion: current.version,
        config: {
          ...current.config,
          rebalanceStrategy: {
            ...current.config.rebalanceStrategy,
            analysisFocus: "focus-A",
          },
        },
      }),
      saveDaaSystemConfig({
        baseVersion: current.version,
        config: {
          ...current.config,
          rebalanceStrategy: {
            ...current.config.rebalanceStrategy,
            analysisFocus: "focus-B",
          },
        },
      }),
    ]);

    const fulfilled = results.filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof saveDaaSystemConfig>>> => item.status === "fulfilled");
    const rejected = results.filter((item): item is PromiseRejectedResult => item.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toContain("system_config_version_conflict");

    const latest = await getDaaSystemConfig();
    expect(latest.version).toBe(current.version + 1);
    expect(["focus-A", "focus-B"]).toContain(latest.config.rebalanceStrategy.analysisFocus);
  });

  it("会清理 legacy system config 重复行并保留最新配置", async () => {
    await withDaaPgClient(async ({ query }) => {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_system_config_v2 (
          id TEXT NOT NULL,
          version BIGINT NOT NULL DEFAULT 1,
          config_json JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const olderConfig = {
        ...structuredClone(DEFAULT_SYSTEM_CONFIG_),
        rebalanceStrategy: {
          ...structuredClone(DEFAULT_SYSTEM_CONFIG_.rebalanceStrategy),
          analysisFocus: "legacy-older",
        },
      };
      const latestConfig = {
        ...structuredClone(DEFAULT_SYSTEM_CONFIG_),
        rebalanceStrategy: {
          ...structuredClone(DEFAULT_SYSTEM_CONFIG_.rebalanceStrategy),
          analysisFocus: "legacy-latest",
        },
      };

      await query(
        "INSERT INTO daa_system_config_v2 (id, version, config_json, updated_at) VALUES ('default', $1, $2::jsonb, $3), ('default', $4, $5::jsonb, $6)",
        [
          1,
          JSON.stringify(olderConfig),
          "2026-01-01T00:00:00.000Z",
          2,
          JSON.stringify(latestConfig),
          "2026-01-02T00:00:00.000Z",
        ],
      );
    });

    const current = await getDaaSystemConfig();
    expect(current.version).toBe(2);
    expect(current.config.rebalanceStrategy.analysisFocus).toBe("legacy-latest");

    await withDaaPgClient(async ({ query }) => {
      const rows = await query("SELECT id, version FROM daa_system_config_v2 WHERE id = 'default' ORDER BY version DESC");
      expect(rows.rows).toHaveLength(1);
      await expect(
        query(
          "INSERT INTO daa_system_config_v2 (id, version, config_json, updated_at) VALUES ('default', $1, $2::jsonb, $3)",
          [3, JSON.stringify(DEFAULT_SYSTEM_CONFIG_), "2026-01-03T00:00:00.000Z"],
        ),
      ).rejects.toThrow();
    });
  });


  it("运行态账户状态迁入 account_state，system config 仅保留稳定配置", async () => {
    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        rebalanceStrategy: {
          ...current.config.rebalanceStrategy,
          analysisFocus: "runtime-account-separated",
        },
        strategy: {
          ...current.config.strategy,
          account: {
            ...current.config.strategy.account,
            baseCurrency: "USD",
            cash: 800,
            investableCash: 760,
            frozenCash: 40,
            totalEquity: 1500,
          },
        },
      },
    });

    const latest = await getDaaSystemConfig();
    expect(latest.config.strategy.account.cash).toBeCloseTo(800, 6);
    expect(latest.config.strategy.account.investableCash).toBeCloseTo(760, 6);
    expect(latest.config.strategy.account.frozenCash).toBeCloseTo(40, 6);
    expect(latest.config.strategy.account.totalEquity).toBeCloseTo(1500, 6);
    expect(latest.config.rebalanceStrategy.analysisFocus).toBe("runtime-account-separated");

    await withDaaPgClient(async ({ query }) => {
      const configRows = await query("SELECT config_json FROM daa_system_config_v2 WHERE id = 'default' LIMIT 1");
      const rawConfig = (configRows.rows[0] as Record<string, unknown>).config_json;
      const persisted = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig as Record<string, any>;
      expect(persisted.strategy.account.cash).toBe(0);
      expect(persisted.strategy.account.investableCash).toBe(0);
      expect(persisted.strategy.account.frozenCash).toBe(0);
      expect(persisted.strategy.account.totalEquity).toBe(null);
      expect(persisted.rebalanceStrategy.analysisFocus).toBe("runtime-account-separated");

      const accountRows = await query(
        "SELECT base_currency, cash, investable_cash, frozen_cash, total_equity FROM daa_account_state WHERE id = 'default' LIMIT 1",
      );
      const account = accountRows.rows[0] as Record<string, unknown>;
      expect(String(account.base_currency)).toBe("USD");
      expect(Number(account.cash)).toBeCloseTo(800, 6);
      expect(Number(account.investable_cash)).toBeCloseTo(760, 6);
      expect(Number(account.frozen_cash)).toBeCloseTo(40, 6);
      expect(Number(account.total_equity)).toBeCloseTo(1500, 6);
    });
  });

  it("cash ledger 更新现金时保留管理员写入的非 account 配置", async () => {
    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        rebalanceStrategy: {
          ...current.config.rebalanceStrategy,
          analysisFocus: "preserve-non-account-fields",
          notifyEmailTo: "ops@example.com",
        },
        strategy: {
          ...current.config.strategy,
          account: {
            ...current.config.strategy.account,
            baseCurrency: "USD",
            cash: 500,
            investableCash: 500,
            frozenCash: 0,
          },
        },
      },
    });

    const applied = await appendDaaCashLedgerEntry({
      side: "deposit",
      amount: 120,
      baseCurrency: "USD",
      note: "manual deposit",
    });

    const latest = await getDaaSystemConfig();
    expect(applied.account.cash).toBeCloseTo(620, 6);
    expect(applied.account.totalEquity).toBeGreaterThanOrEqual(applied.account.cash);
    expect(latest.config.rebalanceStrategy.analysisFocus).toBe("preserve-non-account-fields");
    expect(latest.config.rebalanceStrategy.notifyEmailTo).toBe("ops@example.com");
    expect(latest.config.strategy.account.cash).toBeCloseTo(620, 6);
  });
});
