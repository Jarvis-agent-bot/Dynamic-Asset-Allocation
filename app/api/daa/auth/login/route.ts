import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { getClientIpFromRequestV0, getUserAgentFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import {
  appendDaaAuthAuditEventV0,
  authenticateDaaAuthAccountV0,
  createDaaAuthSessionV0,
  ensureDevDefaultDaaAuthAccountV0,
} from "@/src/daa/auth/daaAuthStoreV0";
import { failV1, okV1 } from "@/src/daa/api/routeHelpersV1";
import { appendNoticeParamV0, normalizeDaaReturnToV0 } from "@/src/daa/urlV0";

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
  const returnTo = normalizeDaaReturnToV0(body?.returnTo);

  const userAgent = getUserAgentFromRequestV0(req) || null;
  const ip = getClientIpFromRequestV0(req) || null;

  if (!username || !password) {
    return failV1("UNAUTHORIZED", "invalid_credentials", { status: 401 });
  }

  try {
    await ensureDevDefaultDaaAuthAccountV0().catch(() => null);

    const account = await authenticateDaaAuthAccountV0({ username, password });
    if (!account) {
      await appendDaaAuthAuditEventV0({
        kind: "auth.login.failed",
        actorUserId: "anonymous",
        payload: { username, returnTo, userAgent, ip },
      }).catch(() => null);

      return failV1("UNAUTHORIZED", "invalid_credentials", { status: 401 });
    }

    const { session, token } = await createDaaAuthSessionV0({
      accountId: account.accountId,
      userAgent,
      ip,
    });

    await appendDaaAuthAuditEventV0({
      kind: "auth.login.success",
      actorUserId: account.accountId,
      accountId: account.accountId,
      sessionId: session.sessionId,
      payload: { username: account.username, returnTo, userAgent, ip },
    }).catch(() => null);

    const redirectTo = appendNoticeParamV0(returnTo, "signed_in");

    const res = okV1({
      redirectTo,
      account: {
        accountId: account.accountId,
        username: account.username,
        roles: account.roles,
      },
    });

    res.cookies.set({
      name: DAA_AUTH_SESSION_COOKIE_V0,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: DAA_AUTH_SESSION_COOKIE_PATH_V0,
      expires: new Date(session.expiresAt),
    });

    return res;
  } catch (error) {
    return failV1("INTERNAL_ERROR", "auth_backend_unavailable", {
      status: 503,
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
