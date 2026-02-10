import { NextResponse, type NextRequest } from "next/server";

// VPS smoke checks for v0 hit explicit trailing-slash URLs like `/daa/step/4/`.
// With `trailingSlash: true` (next.config.js), those URLs are canonical and should render 200.
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/daa/:path*"],
};
