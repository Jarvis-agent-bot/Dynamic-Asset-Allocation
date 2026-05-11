import { checkRateLimit } from "@/src/daa/api/rateLimit";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { bootstrapCreateFirstDaaAuthAccount, type DaaAuthRole } from "@/src/daa/auth/daaAuthStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

const VALID_AUTH_ROLES_: ReadonlySet<string> = new Set(["viewer", "editor"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDaaAuthRole(value: string): value is DaaAuthRole {
  return VALID_AUTH_ROLES_.has(value);
}

function parseBootstrapRoles(value: unknown): DaaAuthRole[] {
  if (!Array.isArray(value)) return ["editor"];
  const roles: DaaAuthRole[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const role = item.trim().toLowerCase();
    if (isDaaAuthRole(role) && !roles.includes(role)) {
      roles.push(role);
    }
  }
  return roles.length ? roles : ["editor"];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

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

  let body: unknown = null;
  try {
    body = await req.json();
  } catch (err) {
    logSwallowed("bootstrapRoute.parseBody", err);
    body = null;
  }

  const payload = isRecord(body) ? body : {};
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const username = (typeof payload.username === "string" ? payload.username.trim() : "") || email;
  const password = typeof payload.password === "string" ? payload.password : "";
  const roles = parseBootstrapRoles(payload.roles);

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
  } catch (error: unknown) {
    const message = errorMessage(error);
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
