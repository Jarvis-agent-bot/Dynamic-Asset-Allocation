import { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { getClientIpFromRequestV0, getUserAgentFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { authenticateDaaAuthAccountV0, createDaaAuthSessionV0 } from "@/src/daa/auth/daaAuthStoreV0";

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

  const account = await authenticateDaaAuthAccountV0({ username, password });
  if (!account) {
    return NextResponse.json({ ok: false, error: "invalid credentials" }, { status: 401 });
  }

  const ua = getUserAgentFromRequestV0(req) || null;
  const ip = getClientIpFromRequestV0(req) || null;

  const { session, token } = await createDaaAuthSessionV0({ accountId: account.accountId, userAgent: ua, ip });

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
