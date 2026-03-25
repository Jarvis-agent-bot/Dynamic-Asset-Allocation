import { createSupabaseServerClient } from "@/src/daa/supabase/server";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

function isSilentMode(req: Request): boolean {
  try {
    const value = new URL(req.url).searchParams.get("silent");
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  } catch (err) {
  logSwallowed("meRoute.resolveSupabaseSession", err);
    return false;
  }
}

export async function GET(req: Request) {
  try {
    const silent = isSilentMode(req);
    const supabase = createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return fail("UNAUTHORIZED", "not_authenticated", { status: silent ? 200 : 401 });
    }

    const roles = Array.isArray(user.app_metadata?.roles)
      ? user.app_metadata.roles
      : ["viewer"];

    return ok({
      account: {
        accountId: user.id,
        username: user.email || user.id,
        roles,
        status: "active",
      },
      session: {
        sessionId: user.id,
        createdAt: user.created_at || new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: null,
        lastSeenAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (isSilentMode(req)) {
      return fail("UNAUTHORIZED", "not_authenticated", { status: 200 });
    }
    logSwallowed("auth.me", error);
    return fail("INTERNAL_ERROR", "auth_backend_unavailable", { status: 503 });
  }
}
