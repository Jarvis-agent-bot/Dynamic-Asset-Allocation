/**
 * Account & system-config store functions.
 */

import { normalizeText, toFinite, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import {
  applySystemConfigPatches,
  DEFAULT_SYSTEM_CONFIG_,
  normalizeSystemConfig,
  type DaaSystemConfigPatch,
  type DaaSystemConfig,
} from "@/src/daa/config/systemConfig";
import { resolveInvestableCash as resolveRuntimeInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import { runDaaStoreRuntimeMigrations } from "@/src/daa/store/runtimeMigrations";
import {
  withDaaPgClient,
  parseJsonb,
  toIsoString,
  isRecord,
  type DaaTxQueryFn,
} from "./storeShared";
import type {
  DaaStoreSystemConfigRow,
  DaaStoreAccountState,
} from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";

export function resolveInvestableCash(cash: number, frozenCash: number, investableCashRaw: unknown): number {
  return resolveRuntimeInvestableCash({
    cash,
    frozenCash,
    investableCash: investableCashRaw,
  });
}

function mapAccountStateRow(row: Record<string, unknown>): DaaStoreAccountState {
  const totalEquityRaw = row.total_equity == null ? Number.NaN : toFiniteNumber(row.total_equity, Number.NaN);
  return {
    id: "default",
    baseCurrency: normalizeCurrencyAlias(normalizeText(row.base_currency, "USD"), "USD"),
    cash: Math.max(0, toFiniteNumber(row.cash, 0)),
    investableCash: Math.max(0, toFiniteNumber(row.investable_cash, 0)),
    frozenCash: Math.max(0, toFiniteNumber(row.frozen_cash, 0)),
    totalEquity: Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : null,
    updatedAt: toIsoString(row.updated_at),
  };
}

export function mergeRuntimeAccountIntoSystemConfig(
  configRaw: DaaSystemConfig,
  account: Pick<DaaStoreAccountState, "baseCurrency" | "cash" | "investableCash" | "frozenCash" | "totalEquity">,
): DaaSystemConfig {
  const normalized = normalizeSystemConfig(configRaw);
  return {
    ...normalized,
    strategy: {
      ...normalized.strategy,
      account: {
        ...normalized.strategy.account,
        baseCurrency: normalizeCurrencyAlias(account.baseCurrency, normalized.strategy.account.baseCurrency) as DaaSystemConfig["strategy"]["account"]["baseCurrency"],
        cash: Math.max(0, toFiniteNumber(account.cash, 0)),
        investableCash: Math.max(0, toFiniteNumber(account.investableCash, 0)),
        frozenCash: Math.max(0, toFiniteNumber(account.frozenCash, 0)),
        totalEquity: account.totalEquity == null ? null : Math.max(0, toFiniteNumber(account.totalEquity, 0)),
      },
    },
  };
}

export function mergeSystemConfigRowWithAccountState(
  row: DaaStoreSystemConfigRow,
  account: DaaStoreAccountState,
): DaaStoreSystemConfigRow {
  return {
    ...row,
    config: mergeRuntimeAccountIntoSystemConfig(row.config, account),
  };
}

export function stripRuntimeAccountFromConfig(configRaw: unknown): {
  sanitizedConfig: DaaSystemConfig;
  runtimeAccount: {
    baseCurrency: string;
    cash: unknown;
    investableCash: unknown;
    frozenCash: unknown;
    totalEquity: unknown;
  };
} {
  const normalized = normalizeSystemConfig(configRaw);
  const rootRaw = isRecord(configRaw) ? configRaw : {};
  const strategyRaw = isRecord(rootRaw.strategy) ? rootRaw.strategy : {};
  const accountRaw = isRecord(strategyRaw.account) ? strategyRaw.account : {};
  const runtimeAccount = {
    baseCurrency: normalizeCurrencyAlias(
      normalizeText(accountRaw.baseCurrency, normalized.strategy.account.baseCurrency),
      normalized.strategy.account.baseCurrency,
    ),
    cash: Object.prototype.hasOwnProperty.call(accountRaw, "cash") ? accountRaw.cash : normalized.strategy.account.cash,
    investableCash: Object.prototype.hasOwnProperty.call(accountRaw, "investableCash") ? accountRaw.investableCash : normalized.strategy.account.investableCash,
    frozenCash: Object.prototype.hasOwnProperty.call(accountRaw, "frozenCash") ? accountRaw.frozenCash : normalized.strategy.account.frozenCash,
    totalEquity: Object.prototype.hasOwnProperty.call(accountRaw, "totalEquity") ? accountRaw.totalEquity : normalized.strategy.account.totalEquity,
  };
  return {
    sanitizedConfig: {
      ...normalized,
      strategy: {
        ...normalized.strategy,
        account: {
          ...normalized.strategy.account,
          cash: 0,
          investableCash: 0,
          frozenCash: 0,
          totalEquity: null,
        },
      },
    },
    runtimeAccount,
  };
}

export function mapSystemConfigRow(row: Record<string, unknown>): DaaStoreSystemConfigRow {
  const versionRaw = Number(row.version);
  return {
    id: "default",
    version: Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1,
    config: normalizeSystemConfig(parseJsonb<Record<string, unknown>>(row.config_json, DEFAULT_SYSTEM_CONFIG_)),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function ensureSystemConfigRowInTx(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
): Promise<DaaStoreSystemConfigRow> {
  await query(`
    CREATE TABLE IF NOT EXISTS daa_system_config_v2 (
      id TEXT PRIMARY KEY,
      version BIGINT NOT NULL DEFAULT 1,
      config_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existing = await query(
    "SELECT id, version, config_json, updated_at FROM daa_system_config_v2 WHERE id='default' ORDER BY version DESC, updated_at DESC",
  );
  if (existing.rows.length > 1) {
    const latest = mapSystemConfigRow(existing.rows[0]);
    await query("DELETE FROM daa_system_config_v2 WHERE id = 'default'");
    const restored = await query(
      "INSERT INTO daa_system_config_v2 (id, version, config_json, updated_at) VALUES ('default', $1, $2::jsonb, $3) RETURNING id, version, config_json, updated_at",
      [Math.max(1, Math.trunc(latest.version)), JSON.stringify(latest.config), latest.updatedAt],
    );
    await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_system_config_v2_id ON daa_system_config_v2(id)");
    return mapSystemConfigRow(restored.rows[0]);
  }
  if (existing.rows.length > 0) {
    await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_system_config_v2_id ON daa_system_config_v2(id)");
    return mapSystemConfigRow(existing.rows[0]);
  }

  const result = await query(
    "INSERT INTO daa_system_config_v2 (id, version, config_json, updated_at) VALUES ('default', 1, $1::jsonb, NOW()) RETURNING id, version, config_json, updated_at",
    [JSON.stringify(DEFAULT_SYSTEM_CONFIG_)],
  );
  await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_system_config_v2_id ON daa_system_config_v2(id)");
  return mapSystemConfigRow(result.rows[0]);
}

export async function ensureAccountStateRowInTx(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
): Promise<DaaStoreAccountState> {
  await query(`
    CREATE TABLE IF NOT EXISTS daa_account_state_v2 (
      id TEXT PRIMARY KEY,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      cash NUMERIC NOT NULL DEFAULT 0,
      investable_cash NUMERIC NOT NULL DEFAULT 0,
      frozen_cash NUMERIC NOT NULL DEFAULT 0,
      total_equity NUMERIC,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existing = await query(
    "SELECT id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at FROM daa_account_state_v2 WHERE id = 'default' LIMIT 1",
  );
  if (existing.rows.length > 0) {
    return mapAccountStateRow(existing.rows[0]);
  }

  const systemRow = await ensureSystemConfigRowInTx(query);
  const strategyRaw = (isRecord(systemRow.config.strategy) ? systemRow.config.strategy : {}) as Record<string, unknown>;
  const accountRaw = (isRecord(strategyRaw.account) ? strategyRaw.account : {}) as Record<string, unknown>;
  const baseCurrency = normalizeCurrencyAlias(normalizeText(accountRaw.baseCurrency, "USD"), "USD");
  const cash = Math.max(0, toFiniteNumber(accountRaw.cash, 0));
  const frozenCash = Math.max(0, toFiniteNumber(accountRaw.frozenCash, 0));
  const investableCash = resolveInvestableCash(cash, frozenCash, accountRaw.investableCash);
  const totalEquityRaw = accountRaw.totalEquity == null ? Number.NaN : toFiniteNumber(accountRaw.totalEquity, Number.NaN);
  const totalEquity = Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : null;

  const inserted = await query(
    `INSERT INTO daa_account_state_v2 (
      id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at
    ) VALUES (
      'default', $1, $2, $3, $4, $5, NOW()
    ) RETURNING id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at`,
    [baseCurrency, cash, investableCash, frozenCash, totalEquity],
  );
  return mapAccountStateRow(inserted.rows[0]);
}

export async function getAccountStateForUpdateInTx(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
): Promise<DaaStoreAccountState> {
  await ensureAccountStateRowInTx(query);
  const locked = await query(
    "SELECT id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at FROM daa_account_state_v2 WHERE id = 'default' LIMIT 1 FOR UPDATE",
  );
  if (locked.rows.length > 0) {
    return mapAccountStateRow(locked.rows[0]);
  }
  return ensureAccountStateRowInTx(query);
}

export async function writeAccountStateInTx(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
  nextRaw: {
    baseCurrency?: unknown;
    cash?: unknown;
    investableCash?: unknown;
    frozenCash?: unknown;
    totalEquity?: unknown;
  },
): Promise<DaaStoreAccountState> {
  const current = await getAccountStateForUpdateInTx(query);
  const cash = Object.prototype.hasOwnProperty.call(nextRaw, "cash")
    ? Math.max(0, toFiniteNumber(nextRaw.cash, current.cash))
    : current.cash;
  const baseCurrency = normalizeCurrencyAlias(
    normalizeText(nextRaw.baseCurrency, current.baseCurrency),
    current.baseCurrency,
  );
  const frozenCash = Object.prototype.hasOwnProperty.call(nextRaw, "frozenCash")
    ? Math.max(0, Math.min(cash, toFiniteNumber(nextRaw.frozenCash, current.frozenCash)))
    : current.frozenCash;
  const investableSource = Object.prototype.hasOwnProperty.call(nextRaw, "investableCash")
    ? nextRaw.investableCash
    : current.investableCash;
  const investableCash = resolveInvestableCash(cash, frozenCash, investableSource);
  let totalEquity = current.totalEquity;
  if (Object.prototype.hasOwnProperty.call(nextRaw, "totalEquity")) {
    if (nextRaw.totalEquity == null) {
      totalEquity = null;
    } else {
      const totalEquityRaw = toFiniteNumber(nextRaw.totalEquity, Number.NaN);
      totalEquity = Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : current.totalEquity;
    }
  }

  const updated = await query(
    `UPDATE daa_account_state_v2
     SET base_currency = $1,
         cash = $2,
         investable_cash = $3,
         frozen_cash = $4,
         total_equity = $5::numeric,
         updated_at = NOW()
     WHERE id = 'default'
     RETURNING id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at`,
    [baseCurrency, cash, investableCash, frozenCash, totalEquity],
  );
  if (updated.rows.length > 0) {
    return mapAccountStateRow(updated.rows[0]);
  }
  return ensureAccountStateRowInTx(query);
}

export async function getSystemConfigRowForUpdateInTx(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
): Promise<DaaStoreSystemConfigRow> {
  await ensureSystemConfigRowInTx(query);
  const locked = await query(
    "SELECT id, version, config_json, updated_at FROM daa_system_config_v2 WHERE id='default' ORDER BY version DESC, updated_at DESC LIMIT 1 FOR UPDATE",
  );
  if (locked.rows.length > 0) {
    return mapSystemConfigRow(locked.rows[0]);
  }
  return ensureSystemConfigRowInTx(query);
}

export async function writeSystemConfigCasInTx(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
  nextConfigRaw: unknown,
  expectedVersion: number,
): Promise<DaaStoreSystemConfigRow> {
  const nextConfig = normalizeSystemConfig(nextConfigRaw);
  const updated = await query(
    "UPDATE daa_system_config_v2 SET version = version + 1, config_json = $2::jsonb, updated_at = NOW() WHERE id = 'default' AND version = $1 RETURNING id, version, config_json, updated_at",
    [Math.max(1, Math.trunc(expectedVersion)), JSON.stringify(nextConfig)],
  );
  if (updated.rows.length > 0) {
    return mapSystemConfigRow(updated.rows[0]);
  }
  const latest = await ensureSystemConfigRowInTx(query);
  throw new Error(`system_config_version_conflict:${latest.version}`);
}

export async function saveSystemConfigInTx(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
  nextConfigRaw: unknown,
  baseVersion?: number,
): Promise<DaaStoreSystemConfigRow> {
  const current = await ensureSystemConfigRowInTx(query);
  const expectedVersion = baseVersion != null ? Math.trunc(baseVersion) : current.version;
  return writeSystemConfigCasInTx(query, nextConfigRaw, expectedVersion);
}

export async function syncStrategyAccountCashInTx(
  query: DaaTxQueryFn,
  nextCash: number,
  opts: {
    totalEquity?: number | null;
  } = {},
): Promise<{
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
}> {
  const currentAccount = await getAccountStateForUpdateInTx(query as any);
  const normalizedNextCash = Math.max(0, toFiniteNumber(nextCash, currentAccount.cash));
  const previousInvestable = resolveInvestableCash(currentAccount.cash, currentAccount.frozenCash, currentAccount.investableCash);
  const delta = normalizedNextCash - currentAccount.cash;
  const nextInvestable = Math.max(0, Math.min(normalizedNextCash, previousInvestable + delta));
  const account = await writeAccountStateInTx(query as any, {
    baseCurrency: currentAccount.baseCurrency,
    cash: normalizedNextCash,
    investableCash: nextInvestable,
    frozenCash: currentAccount.frozenCash,
    totalEquity: Object.prototype.hasOwnProperty.call(opts, "totalEquity") ? opts.totalEquity ?? null : currentAccount.totalEquity,
  });
  return {
    ...account,
    baseCurrency: normalizeCurrencyAlias(account.baseCurrency, "USD"),
  };
}

export async function getDaaSystemConfig(): Promise<DaaStoreSystemConfigRow> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const row = await ensureSystemConfigRowInTx(query as any);
    const account = await ensureAccountStateRowInTx(query as any);
    return mergeSystemConfigRowWithAccountState(row, account);
  });
}

export async function getDaaAccountState(): Promise<DaaStoreAccountState> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => ensureAccountStateRowInTx(query as any));
}

export async function replaceDaaAccountState(input: {
  baseCurrency?: string;
  cash?: number;
  investableCash?: number;
  frozenCash?: number;
  totalEquity?: number | null;
}): Promise<DaaStoreAccountState> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      const account = await writeAccountStateInTx(query as any, input);
      await query("COMMIT");
      return account;
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("accountStore.rollback", err);
      }
      throw error;
    }
  });
}

export async function saveDaaSystemConfig(input: {
  config: unknown;
  baseVersion?: number;
}): Promise<DaaStoreSystemConfigRow> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      const { sanitizedConfig, runtimeAccount } = stripRuntimeAccountFromConfig(input.config);
      const saved = await saveSystemConfigInTx(query as any, sanitizedConfig, input.baseVersion);
      const account = await writeAccountStateInTx(query as any, runtimeAccount);
      await query("COMMIT");
      return mergeSystemConfigRowWithAccountState(saved, account);
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("accountStore.rollback", err);
      }
      throw error;
    }
  });
}

export async function patchDaaSystemConfig(input: {
  patches: DaaSystemConfigPatch[];
  baseVersion?: number;
}): Promise<DaaStoreSystemConfigRow> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      const current = await getSystemConfigRowForUpdateInTx(query as any);
      const currentAccount = await getAccountStateForUpdateInTx(query as any);
      const mergedCurrent = mergeSystemConfigRowWithAccountState(current, currentAccount);
      const nextConfig = applySystemConfigPatches(mergedCurrent.config, Array.isArray(input.patches) ? input.patches : []);
      const { sanitizedConfig, runtimeAccount } = stripRuntimeAccountFromConfig(nextConfig);
      const saved = await saveSystemConfigInTx(query as any, sanitizedConfig, input.baseVersion ?? current.version);
      const account = await writeAccountStateInTx(query as any, runtimeAccount);
      await query("COMMIT");
      return mergeSystemConfigRowWithAccountState(saved, account);
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("accountStore.rollback", err);
      }
      throw error;
    }
  });
}



