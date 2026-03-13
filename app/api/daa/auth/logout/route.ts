import type { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_, DAA_AUTH_SESSION_COOKIE_ } from "@/src/daa/auth/daaAuthConstants";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { appendDaaAuthAuditEvent, revokeDaaAuthSession } from "@/src/daa/auth/daaAuthStore";
import { ok } from "@/src/daa/api/routeHelpers";

export const runtime = "nodejs";

function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: DAA_AUTH_SESSION_COOKIE_,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: DAA_AUTH_SESSION_COOKIE_PATH_,
    maxAge: 0,
  });
}

async function revokeCurrentSession(req: Request) {
  const ctx = await getDaaAuthContextFromRequest(req).catch(() => null);
  if (!ctx) return;

  await appendDaaAuthAuditEvent({
    kind: "auth.logout",
    actorUserId: ctx.account.accountId,
    accountId: ctx.account.accountId,
    sessionId: ctx.session.sessionId,
    payload: {},
  }).catch(() => null);

  await revokeDaaAuthSession({ sessionId: ctx.session.sessionId }).catch(() => null);
}

export async function POST(req: Request) {
  await revokeCurrentSession(req);

  const res = ok({ signedOut: true });
  clearSessionCookie(res);
  return res;
}
