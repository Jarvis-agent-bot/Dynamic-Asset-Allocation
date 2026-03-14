import { createSupabaseFromRequest } from "@/src/daa/supabase/server";
import type { DaaAuthAccount, DaaAuthSession } from "./daaAuthStore";

export function getClientIpFromRequest(req: Request): string {
  const xff = (req.headers.get("x-forwarded-for") || "").trim();
  if (xff) return xff.split(",")[0]!.trim();
  return "";
}

export function getUserAgentFromRequest(req: Request): string {
  return (req.headers.get("user-agent") || "").trim();
}

/**
 * Extract the authenticated user context from a raw Request using Supabase.
 *
 * Returns the same shape as the old Postgres-backed auth so that all
 * downstream code (requireDaaAdminRole, getDaaAdminActorUserIdFromRequest,
 * etc.) continues to work unchanged.
 */
export async function getDaaAuthContextFromRequest(
  req: Request,
  _opts: { touch?: boolean } = {},
): Promise<{
  token: string;
  account: DaaAuthAccount;
  session: DaaAuthSession;
} | null> {
  const supabase = createSupabaseFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Map Supabase user to the existing DaaAuthAccount shape.
  const roles = Array.isArray(user.app_metadata?.roles)
    ? user.app_metadata.roles
    : ["viewer"];

  const account: DaaAuthAccount = {
    accountId: user.id,
    username: user.email || user.user_metadata?.display_name || user.id,
    roles,
    status: "active",
    createdAt: user.created_at || new Date().toISOString(),
    updatedAt: user.updated_at || user.created_at || new Date().toISOString(),
  };

  // Synthesize a session object from the Supabase session metadata.
  const session: DaaAuthSession = {
    sessionId: user.id,
    accountId: user.id,
    createdAt: user.created_at || new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    lastSeenAt: new Date().toISOString(),
    userAgent: getUserAgentFromRequest(req) || null,
    ip: getClientIpFromRequest(req) || null,
  };

  return { token: "", account, session };
}
