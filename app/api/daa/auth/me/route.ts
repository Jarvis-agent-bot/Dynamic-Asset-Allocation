import { fail, ok } from "@/src/daa/api/routeHelpers";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSilentMode(req: Request): boolean {
  try {
    const value = new URL(req.url).searchParams.get("silent");
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  } catch (err) {
    logSwallowed("meRoute.isSilentMode", err);
    return false;
  }
}

export async function GET(req: Request) {
  try {
    const silent = isSilentMode(req);
    const ctx = await getDaaAuthContextFromRequest(req);

    if (!ctx) {
      return fail("UNAUTHORIZED", "not_authenticated", { status: silent ? 200 : 401 });
    }

    return ok({
      account: {
        accountId: ctx.account.accountId,
        username: ctx.account.username,
        roles: ctx.account.roles,
        status: ctx.account.status,
      },
      session: {
        sessionId: ctx.session.sessionId,
        createdAt: ctx.session.createdAt,
        expiresAt: ctx.session.expiresAt,
        revokedAt: ctx.session.revokedAt,
        lastSeenAt: ctx.session.lastSeenAt,
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
