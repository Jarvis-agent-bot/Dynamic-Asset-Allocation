import type { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { getDaaAuthContextFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { appendDaaAuthAuditEventV0, revokeDaaAuthSessionV0 } from "@/src/daa/auth/daaAuthStoreV0";
import { okV1 } from "@/src/daa/api/routeHelpersV1";

export const runtime = "nodejs";

function clearSessionCookieV1(res: NextResponse) {
  res.cookies.set({
    name: DAA_AUTH_SESSION_COOKIE_V0,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: DAA_AUTH_SESSION_COOKIE_PATH_V0,
    maxAge: 0,
  });
}

async function revokeCurrentSessionV1(req: Request) {
  const ctx = await getDaaAuthContextFromRequestV0(req).catch(() => null);
  if (!ctx) return;

  await appendDaaAuthAuditEventV0({
    kind: "auth.logout",
    actorUserId: ctx.account.accountId,
    accountId: ctx.account.accountId,
    sessionId: ctx.session.sessionId,
    payload: {},
  }).catch(() => null);

  await revokeDaaAuthSessionV0({ sessionId: ctx.session.sessionId }).catch(() => null);
}

export async function POST(req: Request) {
  await revokeCurrentSessionV1(req);

  const res = okV1({ signedOut: true });
  clearSessionCookieV1(res);
  return res;
}
