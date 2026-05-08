import { checkRateLimit } from "@/src/daa/api/rateLimit";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { bootstrapCreateFirstDaaAuthAccount } from "@/src/daa/auth/daaAuthStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

/**
 * Bootstrap endpoint: create the first local DAA admin account.
 *
 * This is a one-time setup endpoint. The store-level bootstrap uses an
 * exclusive table lock and only succeeds while no local auth accounts exist.
 */
export async function POST(req: Request) {
  if (!checkRateLimit("bootstrap", req)) {
    return fail("RATE_LIMITED", "请求过于频繁，请稍后重试", { status: 429 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch (err) {
    logSwallowed("bootstrapRoute.parseBody", err);
    body = null;
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const username = (typeof body?.username === "string" ? body.username.trim() : "") || email;
  const password = typeof body?.password === "string" ? body.password : "";
  const roles = Array.isArray(body?.roles) ? body.roles : ["editor"];

  if (!username || !password) {
    return fail("VALIDATION_FAILED", "username and password are required", { status: 400 });
  }

  try {
    const account = await bootstrapCreateFirstDaaAuthAccount({
      username,
      password,
      roles,
    });

    return ok({
      account: {
        accountId: account.accountId,
        username: account.username,
        email: account.username.includes("@") ? account.username : null,
        roles: account.roles,
      },
      bootstrapped: true,
    });
  } catch (error: any) {
    const message = String(error?.message || error || "");
    if (/accounts already exist|bootstrap not allowed|unique constraint/i.test(message)) {
      return fail("UNAUTHORIZED", "bootstrap 已完成，系统已存在账号，禁止再次调用此端点", { status: 403 });
    }
    if (/invalid username|missing username|missing password/i.test(message)) {
      return fail("VALIDATION_FAILED", "username and password are required", { status: 400 });
    }
    if (/postgres|database|daa_db_url|not configured/i.test(message)) {
      return fail("DB_ERROR", "auth_backend_unavailable", { status: 503 });
    }
    console.error("[bootstrap] error:", message);
    return fail("INTERNAL_ERROR", "bootstrap_failed", { status: 500 });
  }
}
