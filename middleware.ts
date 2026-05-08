import { NextResponse, type NextRequest } from "next/server";

import { hasDaaAuthSessionCookie } from "./src/daa/auth/daaAuthCookies";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Keep `/daa/` as-is; only normalize deeper paths.
  if (pathname.startsWith("/daa/") && pathname.length > "/daa/".length && pathname.endsWith("/")) {
    const normalized = pathname.slice(0, -1);
    return NextResponse.rewrite(new URL(`${normalized}${search}`, req.url));
  }

  // 品牌图标是登录页也需要加载的公开静态资源，不能走认证重定向。
  if (pathname.startsWith("/daa/brand/") || pathname === "/daa/icon.png" || pathname === "/daa/apple-touch-icon.png") {
    return NextResponse.next();
  }

  // Login page is always accessible.
  if (pathname === "/daa/login" || pathname.startsWith("/daa/login/")) {
    return NextResponse.next();
  }

  // Middleware only checks the HttpOnly session cookie presence. API routes
  // still validate the token hash and roles against Postgres.
  if (!hasDaaAuthSessionCookie(req.headers.get("cookie"))) {
    const returnTo = `${pathname}${search}`;
    const login = `/daa/login?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(new URL(login, req.url), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/daa", "/daa/:path*"],
};
