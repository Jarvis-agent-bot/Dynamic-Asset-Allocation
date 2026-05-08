import { checkRateLimit } from "@/src/daa/api/rateLimit";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { DAA_AUTH_SESSION_TTL_DAYS, setDaaAuthSessionCookie } from "@/src/daa/auth/daaAuthCookies";
import { getClientIpFromRequest, getUserAgentFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { appendDaaAuthAuditEvent, authenticateDaaAuthAccount, createDaaAuthSession } from "@/src/daa/auth/daaAuthStore";
import { appendNoticeParam, normalizeDaaReturnTo } from "@/src/daa/url";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!checkRateLimit("auth-login", req, { windowMs: 60_000, max: 8 })) {
    return fail("RATE_LIMITED", "请求过于频繁，请稍后重试", { status: 429 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch (err) {
    logSwallowed("loginRoute.parseBody", err);
    body = null;
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const username = (typeof body?.username === "string" ? body.username.trim() : "") || email;
  const password = typeof body?.password === "string" ? body.password : "";
  const returnTo = normalizeDaaReturnTo(body?.returnTo);

  if (!username || !password) {
    return fail("UNAUTHORIZED", "invalid_credentials", { status: 401 });
  }

  try {
    const account = await authenticateDaaAuthAccount({
      username,
      password,
    });

    if (!account) {
      return fail("UNAUTHORIZED", "invalid_credentials", { status: 401 });
    }

    const { session, token } = await createDaaAuthSession({
      accountId: account.accountId,
      ttlDays: DAA_AUTH_SESSION_TTL_DAYS,
      userAgent: getUserAgentFromRequest(req),
      ip: getClientIpFromRequest(req),
    });

    await appendDaaAuthAuditEvent({
      kind: "auth.login.success",
      actorUserId: account.accountId,
      accountId: account.accountId,
      sessionId: session.sessionId,
      payload: {
        username: account.username,
        ip: session.ip,
        userAgent: session.userAgent,
      },
    }).catch((err) => logSwallowed("loginRoute.audit", err));

    const redirectTo = appendNoticeParam(returnTo, "signed_in");

    const response = ok({
      redirectTo,
      account: {
        accountId: account.accountId,
        username: account.username,
        roles: account.roles,
      },
    });
    setDaaAuthSessionCookie(response, token, session.expiresAt);
    return response;
  } catch (error) {
    console.error("[login] auth backend error:", error instanceof Error ? error.message : String(error));
    return fail("INTERNAL_ERROR", "auth_backend_unavailable", { status: 503 });
  }
}
