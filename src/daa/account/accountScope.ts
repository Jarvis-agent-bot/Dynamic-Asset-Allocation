import { AsyncLocalStorage } from "node:async_hooks";

import { isDaaPgEnabled, withDaaPgClient } from "@/src/daa/pg/daaPg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const DEFAULT_DAA_ACCOUNT_SCOPE_ID = "default";

type DaaAccountScopeStore = {
  accountId: string;
};

const scopeStorage = new AsyncLocalStorage<DaaAccountScopeStore>();

export function normalizeDaaAccountScopeId(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  return text || DEFAULT_DAA_ACCOUNT_SCOPE_ID;
}

export function getDaaAccountScopeId(): string {
  return normalizeDaaAccountScopeId(scopeStorage.getStore()?.accountId);
}

export function enterDaaAccountScope(accountId: unknown): string {
  const normalized = normalizeDaaAccountScopeId(accountId);
  scopeStorage.enterWith({ accountId: normalized });
  return normalized;
}

export async function withDaaAccountScope<T>(accountId: unknown, fn: () => Promise<T>): Promise<T> {
  const normalized = normalizeDaaAccountScopeId(accountId);
  return scopeStorage.run({ accountId: normalized }, fn);
}

async function authAccountsTableExists(): Promise<boolean> {
  if (!isDaaPgEnabled()) return false;
  try {
    return await withDaaPgClient(async ({ query }) => {
      const res = await query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'daa_auth_accounts' LIMIT 1",
      );
      return res.rows.length > 0;
    });
  } catch (err) {
    logSwallowed("accountScope.authAccountsTableExists", err);
    return false;
  }
}

export async function resolvePrimaryDaaAccountScopeId(): Promise<string> {
  if (!(await authAccountsTableExists())) return DEFAULT_DAA_ACCOUNT_SCOPE_ID;
  try {
    return await withDaaPgClient(async ({ query }) => {
      const res = await query(
        "SELECT account_id FROM daa_auth_accounts WHERE status = 'active' ORDER BY created_at ASC, account_id ASC LIMIT 1",
      );
      return normalizeDaaAccountScopeId(res.rows[0]?.account_id);
    });
  } catch (err) {
    logSwallowed("accountScope.resolvePrimaryDaaAccountScopeId", err);
    return DEFAULT_DAA_ACCOUNT_SCOPE_ID;
  }
}

export async function resolveDaaAccountScopeIdForAuthAccount(accountIdRaw: unknown): Promise<string> {
  const accountId = normalizeDaaAccountScopeId(accountIdRaw);
  const primaryAccountId = await resolvePrimaryDaaAccountScopeId();
  if (primaryAccountId === accountId) return DEFAULT_DAA_ACCOUNT_SCOPE_ID;
  return accountId;
}

export async function enterDaaAccountScopeForAuthAccount(accountId: unknown): Promise<string> {
  const scopeId = await resolveDaaAccountScopeIdForAuthAccount(accountId);
  return enterDaaAccountScope(scopeId);
}

export async function enterPrimaryDaaAccountScope(): Promise<string> {
  return enterDaaAccountScope(DEFAULT_DAA_ACCOUNT_SCOPE_ID);
}
