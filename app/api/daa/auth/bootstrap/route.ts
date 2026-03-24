import { createClient } from "@supabase/supabase-js";

import { fail, ok } from "@/src/daa/api/routeHelpers";
import { resolveSecret } from "@/src/daa/config/secretsManager";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

/**
 * Bootstrap endpoint: create the first admin account via Supabase Admin API.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (server-side only, never exposed to client).
 * This is a one-time setup endpoint.
 */
export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch (err) {
  logSwallowed("bootstrapRoute.parseBody", err);
    body = null;
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const roles = Array.isArray(body?.roles) ? body.roles : ["editor"];

  if (!email || !password) {
    return fail("VALIDATION_FAILED", "email and password are required", { status: 400 });
  }

  const supabaseUrl = await resolveSecret("supabase_url");
  const serviceRoleKey = await resolveSecret("supabase_service_role_key");

  if (!supabaseUrl || !serviceRoleKey) {
    return fail("INTERNAL_ERROR", "Supabase service role key not configured", { status: 500 });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { roles },
    });

    if (error) {
      const status = error.message.includes("already") ? 409 : 400;
      return fail("VALIDATION_FAILED", error.message, { status });
    }

    return ok({
      account: {
        accountId: data.user.id,
        email: data.user.email,
        roles,
      },
      bootstrapped: true,
    });
  } catch (error: any) {
    return fail("INTERNAL_ERROR", error?.message || String(error), { status: 500 });
  }
}
