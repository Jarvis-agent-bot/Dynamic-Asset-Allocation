import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create a Supabase server client for use in API route handlers and
 * server components.  Uses next/headers cookies() so the Supabase SDK
 * can read **and set** auth cookies (token refresh).
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll can throw in Server Components (read-only context).
            // Middleware handles refresh in that case.
          }
        },
      },
    },
  );
}

/**
 * Create a read-only Supabase client from a raw Request object.
 * Used by getDaaAuthContextFromRequest() which receives a raw Request
 * in API route handlers.
 *
 * This client can validate the session but cannot refresh tokens.
 * Token refresh is handled by the middleware before routes execute.
 */
export function createSupabaseFromRequest(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookieMap = parseCookieHeader(cookieHeader);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(cookieMap).map(([name, value]) => ({ name, value }));
        },
        setAll() {
          // No-op: middleware handles token refresh before routes execute.
        },
      },
    },
  );
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}
