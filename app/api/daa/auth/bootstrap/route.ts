import { createClient } from "@supabase/supabase-js";

import { checkRateLimit } from "@/src/daa/api/rateLimit";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { resolveSecret } from "@/src/daa/config/secretsManager";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

/**
 * Bootstrap endpoint: create the first admin account via Supabase Admin API.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (server-side only, never exposed to client).
 * This is a one-time setup endpoint — only allowed when no accounts exist yet.
 */
export async function POST(req: Request) {
  if (!checkRateLimit("bootstrap", req)) {
    return fail("RATE_LIMITED", "请求过于频繁，请稍后重试", { status: 429 });
  }
  // --- P0 安全守卫：仅在无账号时允许 bootstrap ---
  const supabaseUrlPre = await resolveSecret("supabase_url");
  const serviceRoleKeyPre = await resolveSecret("supabase_service_role_key");
  if (supabaseUrlPre && serviceRoleKeyPre) {
    try {
      const adminCheck = createClient(supabaseUrlPre, serviceRoleKeyPre, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: existingUsers } = await adminCheck.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (existingUsers && existingUsers.users && existingUsers.users.length > 0) {
        return fail("UNAUTHORIZED", "bootstrap 已完成，系统已存在账号，禁止再次调用此端点", { status: 403 });
      }
    } catch (err) {
      logSwallowed("bootstrapRoute.guardCheck", err);
      // 守卫检查失败 → 任何环境都拒绝 bootstrap（安全兜底）
      return fail("INTERNAL_ERROR", "无法验证系统状态，已拒绝 bootstrap", { status: 500 });
    }
  } else {
    // 密钥未配置 → 拒绝 bootstrap（防止无守卫穿透）
    return fail("INTERNAL_ERROR", "supabase 密钥未配置，无法执行 bootstrap", { status: 500 });
  }
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
    console.error("[bootstrap] error:", error?.message || String(error));
    return fail("INTERNAL_ERROR", "bootstrap_failed", { status: 500 });
  }
}
