import { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { getDaaAuthContextFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { ensureDevDefaultDaaAuthAccountV0, refreshDaaAuthSessionV0 } from "@/src/daa/auth/daaAuthStoreV0";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await ensureDevDefaultDaaAuthAccountV0().catch(() => null);

    const ctx = await getDaaAuthContextFromRequestV0(req, { touch: false });
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    const { account, session, token } = ctx;
    const refreshed = await refreshDaaAuthSessionV0({ sessionId: session.sessionId });
    const responseSession = refreshed ?? session;

    // Intentionally exclude the raw session token.
    const res = NextResponse.json({
      ok: true,
      account: {
        accountId: account.accountId,
        username: account.username,
        roles: account.roles,
        status: account.status,
      },
      session: {
        sessionId: responseSession.sessionId,
        createdAt: responseSession.createdAt,
        expiresAt: responseSession.expiresAt,
        revokedAt: responseSession.revokedAt,
        lastSeenAt: responseSession.lastSeenAt,
      },
    });

    if (refreshed) {
      res.cookies.set({
        name: DAA_AUTH_SESSION_COOKIE_V0,
        value: token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: DAA_AUTH_SESSION_COOKIE_PATH_V0,
        expires: new Date(refreshed.expiresAt),
      });
    }

    return res;
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "auth_backend_unavailable",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
