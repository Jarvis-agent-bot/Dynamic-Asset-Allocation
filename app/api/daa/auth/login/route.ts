import { createSupabaseServerClient } from "@/src/daa/supabase/server";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { appendNoticeParam, normalizeDaaReturnTo } from "@/src/daa/url";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  // 兼容旧请求里仍然传来的 username 字段
  const emailOrUsername = email || (typeof body?.username === "string" ? body.username.trim() : "");
  const password = typeof body?.password === "string" ? body.password : "";
  const returnTo = normalizeDaaReturnTo(body?.returnTo);

  if (!emailOrUsername || !password) {
    return fail("UNAUTHORIZED", "invalid_credentials", { status: 401 });
  }

  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailOrUsername,
      password,
    });

    if (error || !data.user) {
      return fail("UNAUTHORIZED", "invalid_credentials", { status: 401 });
    }

    const redirectTo = appendNoticeParam(returnTo, "signed_in");

    const roles = Array.isArray(data.user.app_metadata?.roles)
      ? data.user.app_metadata.roles
      : ["viewer"];

    return ok({
      redirectTo,
      account: {
        accountId: data.user.id,
        username: data.user.email || data.user.id,
        roles,
      },
    });
  } catch (error) {
    return fail("INTERNAL_ERROR", "auth_backend_unavailable", {
      status: 503,
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
