import { NextResponse, type NextRequest } from "next/server";

// VPS smoke checks for v0 hit explicit trailing-slash URLs like `/daa/step/4/`.
// Some deployments still treat the non-slash form as canonical and will 308-redirect.
// To make smoke checks deterministic, internally rewrite `/daa/**/` -> `/daa/**` (no redirect).
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Keep `/daa/` as-is; only normalize deeper paths.
  if (pathname.startsWith("/daa/") && pathname.length > "/daa/".length && pathname.endsWith("/")) {
    const normalized = pathname.slice(0, -1);
    return NextResponse.rewrite(new URL(`${normalized}${search}`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/daa/:path*"],
};
