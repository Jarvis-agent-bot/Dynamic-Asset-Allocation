import { NextResponse, type NextRequest } from "next/server";

// VPS smoke checks for v0 hit explicit trailing-slash URLs like `/daa/step/4/`.
// Some deployments still normalize away trailing slashes (308) before rendering.
// Rewrite (not redirect) so `/daa/step/:id/` serves 200 without changing the URL.
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/daa/step/") && pathname.endsWith("/") && pathname !== "/daa/step/") {
    const without = pathname.slice(0, -1);
    const url = new URL(without + search, req.url);
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/daa/:path*"],
};
