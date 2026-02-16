import { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { getDaaAuthContextFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { revokeDaaAuthSessionV0 } from "@/src/daa/auth/daaAuthStoreV0";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getDaaAuthContextFromRequestV0(req);
  if (ctx) {
    await revokeDaaAuthSessionV0({ sessionId: ctx.session.sessionId });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: DAA_AUTH_SESSION_COOKIE_V0,
    value: "",
    // Mirror login cookie attributes to avoid leaving a stale session token around.
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: DAA_AUTH_SESSION_COOKIE_PATH_V0,
    maxAge: 0,
  });
  return res;
}
