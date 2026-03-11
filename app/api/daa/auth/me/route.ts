import type { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { getDaaAuthContextFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { ensureDevDefaultDaaAuthAccountV0, refreshDaaAuthSessionV0 } from "@/src/daa/auth/daaAuthStoreV0";
import { failV1, okV1 } from "@/src/daa/api/routeHelpersV1";
import { shouldUseDevMemFallbackV1 } from "@/src/daa/devMemFallbackV1";

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

function unauthenticatedResponse(opts?: { silent?: boolean }) {
  const silent = Boolean(opts?.silent);
  const res = failV1("UNAUTHORIZED", "not_authenticated", { status: silent ? 200 : 401 });
  clearSessionCookieV1(res);
  return res;
}

export async function GET(req: Request) {
  try {
    await ensureDevDefaultDaaAuthAccountV0().catch(() => null);
    const silent = isSilentMode(req);

    const ctx = await getDaaAuthContextFromRequestV0(req, { touch: false });
    if (!ctx) {
      return unauthenticatedResponse({ silent });
    }

    const { account, session, token } = ctx;
    const refreshed = await refreshDaaAuthSessionV0({ sessionId: session.sessionId });
    const responseSession = refreshed ?? session;

    const res = okV1({
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
  } catch (error) {
    if (isSilentMode(req) && shouldUseDevMemFallbackV1(error)) {
      return unauthenticatedResponse({ silent: true });
    }
    return failV1("INTERNAL_ERROR", "auth_backend_unavailable", {
      status: 503,
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
