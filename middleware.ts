import { NextResponse, type NextRequest } from "next/server";

// VPS smoke checks hit explicit trailing-slash URLs (e.g. /daa/step/4/).
// Some deployments may still canonicalize these to no-slash (308). Rewriting
// keeps the requested URL stable while serving the correct page with 200.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/daa/") && pathname.length > 1 && pathname.endsWith("/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(0, -1);
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/daa/:path*"],
};
