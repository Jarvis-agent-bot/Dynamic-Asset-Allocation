import { NextResponse, type NextRequest } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "./src/daa/auth/daaAuthConstantsV0";
import { getDaaDashboardCompatRedirect } from "./src/daa/dashboardCompat";
import { getDaaLoginAuthedRedirect } from "./src/daa/loginCompat";

// VPS smoke checks for v0 hit explicit trailing-slash URLs like `/daa/step/4/`.
// Some deployments still treat the non-slash form as canonical and will 308-redirect.
// To make smoke checks deterministic, internally rewrite `/daa/**/` -> `/daa/**` (no redirect).
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const compatRedirect = getDaaDashboardCompatRedirect(pathname, search);
  if (compatRedirect) {
    return NextResponse.redirect(new URL(compatRedirect, req.url), 307);
  }

  const token = req.cookies.get(DAA_AUTH_SESSION_COOKIE_V0)?.value?.trim() || "";

  // If the user is already signed in, `/daa/login` should bounce back into the canonical entry.
  const loginAuthedRedirect = getDaaLoginAuthedRedirect({ pathname, search, hasSession: Boolean(token) });
  if (loginAuthedRedirect) {
    return NextResponse.redirect(new URL(loginAuthedRedirect, req.url), 307);
  }

  // Keep `/daa/` as-is; only normalize deeper paths.
  if (pathname.startsWith("/daa/") && pathname.length > "/daa/".length && pathname.endsWith("/")) {
    const normalized = pathname.slice(0, -1);
    return NextResponse.rewrite(new URL(`${normalized}${search}`, req.url));
  }

  // Keep the canonical dashboard entry public so unauthenticated users can land on it.
  const isPublicDashboardEntry = pathname === "/daa/dashboard" || pathname === "/daa/dashboard/";

  // Auth gate: non-public DAA console pages require a session cookie; redirect to /daa/login.
  if (pathname === "/daa/login" || pathname.startsWith("/daa/login/") || isPublicDashboardEntry) {
    return NextResponse.next();
  }

  if (!token) {
    const returnTo = `${pathname}${search}`;
    const login = `/daa/login?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(new URL(login, req.url), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/daa", "/daa/:path*"],
};
