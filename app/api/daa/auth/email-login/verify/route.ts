import { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "../../../../../../src/daa/auth/daaAuthConstantsV0";
import { consumeDaaAuthEmailLoginTokenWithReasonV0 } from "../../../../../../src/daa/auth/daaAuthEmailLoginStoreV0";
import { getClientIpFromRequestV0, getUserAgentFromRequestV0 } from "../../../../../../src/daa/auth/daaAuthRequestV0";
import { appendDaaAuthAuditEventV0, getDaaAuthAccountByUsernameV0 } from "../../../../../../src/daa/auth/daaAuthStoreV0";
import { appendNoticeParamV0, normalizeDaaReturnToV0 } from "../../../../../../src/daa/urlV0";

export const runtime = "nodejs";

function normalizeEmailLoose(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return "";
  if (v.length > 254) return "";
  if (/\s/.test(v)) return "";

  const at = v.indexOf("@");
  if (at <= 0 || at !== v.lastIndexOf("@")) return "";

  const domain = v.slice(at + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".")) return "";
  if (!domain.includes(".")) return "";

  return v;
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const email = normalizeEmailLoose(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const returnTo = normalizeDaaReturnToV0(body?.returnTo);

  const ua = getUserAgentFromRequestV0(req) || null;
  const ip = getClientIpFromRequestV0(req) || null;

  if (!email || !code) {
    return NextResponse.json({ ok: false, error: "invalid code" }, { status: 401 });
  }

  const account = await getDaaAuthAccountByUsernameV0(email).catch(() => null);
  if (!account || account.status !== "active") {
    return NextResponse.json({ ok: false, error: "invalid code" }, { status: 401 });
  }

  const found = await consumeDaaAuthEmailLoginTokenWithReasonV0({ token: code, userAgent: ua, ip });
  if (!found.ok || found.account.accountId !== account.accountId) {
    await appendDaaAuthAuditEventV0({
      kind: "auth.email_otp.verify_failed",
      actorUserId: "anonymous",
      accountId: account.accountId,
      payload: {
        reason: found.ok ? "email_mismatch" : found.error,
        returnTo,
        ip,
        userAgent: ua,
      },
    }).catch(() => null);

    return NextResponse.json({ ok: false, error: "invalid code" }, { status: 401 });
  }

  await appendDaaAuthAuditEventV0({
    kind: "auth.email_otp.verify_success",
    actorUserId: found.account.accountId,
    accountId: found.account.accountId,
    sessionId: found.session.sessionId,
    payload: {
      returnTo,
      ip,
      userAgent: ua,
    },
  }).catch(() => null);

  const redirectTo = appendNoticeParamV0(returnTo, "signed_in");

  const res = NextResponse.json({
    ok: true,
    redirectTo,
    account: {
      accountId: found.account.accountId,
      username: found.account.username,
      roles: found.account.roles,
    },
  });

  res.cookies.set({
    name: DAA_AUTH_SESSION_COOKIE_V0,
    value: found.sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: DAA_AUTH_SESSION_COOKIE_PATH_V0,
    expires: new Date(found.session.expiresAt),
  });

  return res;
}
