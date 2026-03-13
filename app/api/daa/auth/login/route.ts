import { DAA_AUTH_SESSION_COOKIE_PATH_, DAA_AUTH_SESSION_COOKIE_ } from "@/src/daa/auth/daaAuthConstants";
import { getClientIpFromRequest, getUserAgentFromRequest } from "@/src/daa/auth/daaAuthRequest";
import {
  appendDaaAuthAuditEvent,
  authenticateDaaAuthAccount,
  createDaaAuthSession,
  ensureDevDefaultDaaAuthAccount,
} from "@/src/daa/auth/daaAuthStore";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { appendNoticeParam, normalizeDaaReturnTo } from "@/src/daa/url";

export const runtime = "nodejs";

function normalizeUsernameLoose(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return "";
  if (v.length > 64) return "";
  if (/\s/.test(v)) return "";
  if (!/^[a-z0-9._@+\-]+$/.test(v)) return "";
  return v;
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const username = normalizeUsernameLoose(body?.username);
  const password = typeof body?.password === "string" ? body.password : "";
  const returnTo = normalizeDaaReturnTo(body?.returnTo);

  const userAgent = getUserAgentFromRequest(req) || null;
  const ip = getClientIpFromRequest(req) || null;

  if (!username || !password) {
    return fail("UNAUTHORIZED", "invalid_credentials", { status: 401 });
  }

  try {
    await ensureDevDefaultDaaAuthAccount().catch(() => null);

    const account = await authenticateDaaAuthAccount({ username, password });
    if (!account) {
      await appendDaaAuthAuditEvent({
        kind: "auth.login.failed",
        actorUserId: "anonymous",
        payload: { username, returnTo, userAgent, ip },
      }).catch(() => null);

      return fail("UNAUTHORIZED", "invalid_credentials", { status: 401 });
    }

    const { session, token } = await createDaaAuthSession({
      accountId: account.accountId,
      userAgent,
      ip,
    });

    await appendDaaAuthAuditEvent({
      kind: "auth.login.success",
      actorUserId: account.accountId,
      accountId: account.accountId,
      sessionId: session.sessionId,
      payload: { username: account.username, returnTo, userAgent, ip },
    }).catch(() => null);

    const redirectTo = appendNoticeParam(returnTo, "signed_in");

    const res = ok({
      redirectTo,
      account: {
        accountId: account.accountId,
        username: account.username,
        roles: account.roles,
      },
    });

    res.cookies.set({
      name: DAA_AUTH_SESSION_COOKIE_,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: DAA_AUTH_SESSION_COOKIE_PATH_,
      expires: new Date(session.expiresAt),
    });

    return res;
  } catch (error) {
    return fail("INTERNAL_ERROR", "auth_backend_unavailable", {
      status: 503,
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
