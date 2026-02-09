import { NextResponse, type NextRequest } from "next/server";

// Keep middleware lightweight.
// Trailing-slash behavior is handled via next.config.js (trailingSlash: true).
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/daa/:path*"],
};
