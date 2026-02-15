import { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { getClientIpFromRequestV0, getUserAgentFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { consumeDaaAuthEmailLoginTokenWithReasonV0 } from "@/src/daa/auth/daaAuthEmailLoginStoreV0";
import { normalizeDaaReturnToV0 } from "@/src/daa/urlV0";

export const runtime = "nodejs";

// returnTo normalization is shared via src/daa/urlV0.ts

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const returnTo = normalizeDaaReturnToV0(url.searchParams.get("returnTo"));

  const ua = getUserAgentFromRequestV0(req) || null;
  const ip = getClientIpFromRequestV0(req) || null;

  const found = await consumeDaaAuthEmailLoginTokenWithReasonV0({ token, userAgent: ua, ip });
  if (!found.ok) {
    const loginUrl = new URL("/daa/login", url);
    const err = found.error === "used" ? "email-link-used" : found.error === "expired" ? "email-link-expired" : "email-link-invalid";
    loginUrl.searchParams.set("error", err);
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl, 302);
  }

  const target = new URL(returnTo, url);
  if (!target.searchParams.get("notice")) target.searchParams.set("notice", "signed_in");

  const res = NextResponse.redirect(target, 302);
  res.cookies.set({
    name: DAA_AUTH_SESSION_COOKIE_V0,
    value: found.sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(found.session.expiresAt),
  });

  return res;
}
