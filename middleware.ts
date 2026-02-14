import { NextResponse, type NextRequest } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_V0 } from "./src/daa/auth/daaAuthConstantsV0";
import { getDaaDashboardCompatRedirect } from "./src/daa/dashboardCompat";

// VPS smoke checks for v0 hit explicit trailing-slash URLs like `/daa/step/4/`.
// Some deployments still treat the non-slash form as canonical and will 308-redirect.
// To make smoke checks deterministic, internally rewrite `/daa/**/` -> `/daa/**` (no redirect).
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const compatRedirect = getDaaDashboardCompatRedirect(pathname, search);
  if (compatRedirect) {
    return NextResponse.redirect(new URL(compatRedirect, req.url), 307);
  }

  // Keep `/daa/` as-is; only normalize deeper paths.
  if (pathname.startsWith("/daa/") && pathname.length > "/daa/".length && pathname.endsWith("/")) {
    const normalized = pathname.slice(0, -1);
    return NextResponse.rewrite(new URL(`${normalized}${search}`, req.url));
  }

  // Auth gate: DAA console pages require a session cookie; redirect to /daa/login.
  if (pathname === "/daa/login" || pathname.startsWith("/daa/login/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(DAA_AUTH_SESSION_COOKIE_V0)?.value?.trim() || "";
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
