import type { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_, DAA_AUTH_SESSION_COOKIE_ } from "@/src/daa/auth/daaAuthConstants";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { ensureDevDefaultDaaAuthAccount, refreshDaaAuthSession } from "@/src/daa/auth/daaAuthStore";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { shouldUseDevMemFallback } from "@/src/daa/devMemFallback";

export const runtime = "nodejs";

function isSilentMode(req: Request): boolean {
  try {
    const value = new URL(req.url).searchParams.get("silent");
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  } catch {
    return false;
  }
}

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

function unauthenticatedResponse(opts?: { silent?: boolean }) {
  const silent = Boolean(opts?.silent);
  const res = fail("UNAUTHORIZED", "not_authenticated", { status: silent ? 200 : 401 });
  clearSessionCookie(res);
  return res;
}

export async function GET(req: Request) {
  try {
    await ensureDevDefaultDaaAuthAccount().catch(() => null);
    const silent = isSilentMode(req);

    const ctx = await getDaaAuthContextFromRequest(req, { touch: false });
    if (!ctx) {
      return unauthenticatedResponse({ silent });
    }

    const { account, session, token } = ctx;
    const refreshed = await refreshDaaAuthSession({ sessionId: session.sessionId });
    const responseSession = refreshed ?? session;

    const res = ok({
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
        name: DAA_AUTH_SESSION_COOKIE_,
        value: token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: DAA_AUTH_SESSION_COOKIE_PATH_,
        expires: new Date(refreshed.expiresAt),
      });
    }

    return res;
  } catch (error) {
    if (isSilentMode(req) && shouldUseDevMemFallback(error)) {
      return unauthenticatedResponse({ silent: true });
    }
    return fail("INTERNAL_ERROR", "auth_backend_unavailable", {
      status: 503,
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
