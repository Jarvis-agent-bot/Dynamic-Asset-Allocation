// Next.js instrumentation hook.
// Ensures the DAA SQLite schema is migrated once at process boot so failures surface early.

export async function register() {
  // This file only runs in the Node.js runtime (not Edge), but keep the guard explicit.
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.DAA_SQLITE_DISABLE_BOOT_MIGRATIONS === "1") return;

  try {
    const { withDaaSqliteDbV0 } = await import("@/src/daa/sqlite/daaSqliteDbV0");
    await withDaaSqliteDbV0(({ db }) => {
      db.exec("SELECT 1;");
    });
  } catch (e) {
    console.error("[daa_sqlite] boot-time migrations failed", e);
    // Fail fast: a broken schema should block the server from starting.
    throw e;
  }
}
