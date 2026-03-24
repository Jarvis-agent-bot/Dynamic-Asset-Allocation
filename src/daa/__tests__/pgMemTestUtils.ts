type TestGlobalState = typeof globalThis & Record<string, unknown>;

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function getTestGlobalState(): TestGlobalState {
  return globalThis as TestGlobalState;
}

export function resetPgMemRuntime(): void {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;

  const state = getTestGlobalState();
  delete state[PG_GLOBAL_KEY];
  delete state[STORE_GLOBAL_KEY];
}

export function setPgMemStoreState(value: unknown): void {
  getTestGlobalState()[STORE_GLOBAL_KEY] = value;
}

export function clearPgMemStoreState(): void {
  delete getTestGlobalState()[STORE_GLOBAL_KEY];
}
