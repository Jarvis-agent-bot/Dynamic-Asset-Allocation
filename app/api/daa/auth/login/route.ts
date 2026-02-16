import { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { getClientIpFromRequestV0, getUserAgentFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { appendDaaAuthAuditEventV0, authenticateDaaAuthAccountV0, createDaaAuthSessionV0 } from "@/src/daa/auth/daaAuthStoreV0";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const ua = getUserAgentFromRequestV0(req) || null;
  const ip = getClientIpFromRequestV0(req) || null;

  const account = await authenticateDaaAuthAccountV0({ username, password });
  if (!account) {
    await appendDaaAuthAuditEventV0({
      kind: "auth.login.failed",
      actorUserId: "anonymous",
      payload: {
        username: typeof username === "string" ? username.trim().toLowerCase() : "",
        reason: "invalid_credentials",
        ip,
        userAgent: ua,
      },
    }).catch(() => null);
    return NextResponse.json({ ok: false, error: "invalid credentials" }, { status: 401 });
  }

  const { session, token } = await createDaaAuthSessionV0({ accountId: account.accountId, userAgent: ua, ip });

  await appendDaaAuthAuditEventV0({
    kind: "auth.login.success",
    actorUserId: account.accountId,
    accountId: account.accountId,
    sessionId: session.sessionId,
    payload: {
      ip,
      userAgent: ua,
    },
  }).catch(() => null);

  const res = NextResponse.json({ ok: true, account: { accountId: account.accountId, username: account.username, roles: account.roles } });
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
}
