// Next.js instrumentation hook.
// Best-effort schema check on boot so broken Postgres connectivity surfaces early.

export async function register() {
  // This file only runs in the Node.js runtime (not Edge), but keep the guard explicit.
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.DAA_PG_DISABLE_BOOT_SCHEMA === "1") return;

  try {
    const { isDaaPgEnabled, ensureDaaAuthSchemaPg } = await import("@/src/daa/pg/daaPg");
    const { ensureDaaStoreSchemaPg } = await import("@/src/daa/store/daaStorePg");

    // Allow the app to boot without a DB configured (dev/preview), but when a DB is configured,
    // fail fast so deployment issues are immediately visible.
    if (!isDaaPgEnabled()) return;

    await ensureDaaAuthSchemaPg();
    await ensureDaaStoreSchemaPg();
  } catch (e) {
    console.error("[daa_pg] boot-time schema init failed", e);
    throw e;
  }
}
