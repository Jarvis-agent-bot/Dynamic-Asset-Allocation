import { ok } from "@/src/daa/api/routeHelpers";
import { clearDaaAuthSessionCookie } from "@/src/daa/auth/daaAuthCookies";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { appendDaaAuthAuditEvent, revokeDaaAuthSession } from "@/src/daa/auth/daaAuthStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getDaaAuthContextFromRequest(req, { touch: false }).catch((err) => {
    logSwallowed("logoutRoute.resolveSession", err);
    return null;
  });

  if (ctx) {
    await revokeDaaAuthSession({ sessionId: ctx.session.sessionId }).catch((err) => logSwallowed("logoutRoute.revoke", err));
    await appendDaaAuthAuditEvent({
      kind: "auth.logout",
      actorUserId: ctx.account.accountId,
      accountId: ctx.account.accountId,
      sessionId: ctx.session.sessionId,
      payload: { username: ctx.account.username },
    }).catch((err) => logSwallowed("logoutRoute.audit", err));
  }

  const response = ok({ signedOut: true });
  clearDaaAuthSessionCookie(response);
  return response;
}
