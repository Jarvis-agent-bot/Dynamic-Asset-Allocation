import { ok, withApiHandler } from "@/src/daa/api/routeHelpers";

/**
 * GET /api/daa/engine-health
 *
 * Lightweight health-check consumed by the production smoke test
 * (deploy/smoke_prod_dashboard_engine.mjs).  Returns { ok: true }
 * when the Next.js process is alive.
 */
export async function GET() {
  return withApiHandler(async () => ok({ ok: true }));
}
