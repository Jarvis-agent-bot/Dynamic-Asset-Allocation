// Next.js instrumentation hook.
// Best-effort schema check on boot so broken Postgres connectivity surfaces early.

export async function register() {
  // This file only runs in the Node.js runtime (not Edge), but keep the guard explicit.
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.DAA_PG_DISABLE_BOOT_SCHEMA === "1") return;

  try {
    const { isDaaPgEnabledV0, ensureDaaAuthSchemaPgV0 } = await import("@/src/daa/pg/daaPgV0");
    const { ensureDaaStoreSchemaPgV1 } = await import("@/src/daa/store/daaStorePgV1");

    // Allow the app to boot without a DB configured (dev/preview), but when a DB is configured,
    // fail fast so deployment issues are immediately visible.
    if (!isDaaPgEnabledV0()) return;

    await ensureDaaAuthSchemaPgV0();
    await ensureDaaStoreSchemaPgV1();
  } catch (e) {
    console.error("[daa_pg] boot-time schema init failed", e);
    throw e;
  }
}
