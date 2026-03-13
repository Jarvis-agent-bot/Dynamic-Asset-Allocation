import { NextResponse, type NextRequest } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_ } from "./src/daa/auth/daaAuthConstants";

// 统一 DAA 路径的尾部斜杠，避免线上环境 308 干扰体验。
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const token = req.cookies.get(DAA_AUTH_SESSION_COOKIE_)?.value?.trim() || "";

  // Keep `/daa/` as-is; only normalize deeper paths.
  if (pathname.startsWith("/daa/") && pathname.length > "/daa/".length && pathname.endsWith("/")) {
    const normalized = pathname.slice(0, -1);
    return NextResponse.rewrite(new URL(`${normalized}${search}`, req.url));
  }

  // Auth gate: all DAA console pages (except login) require a session cookie.
  if (pathname === "/daa/login" || pathname.startsWith("/daa/login/")) {
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
