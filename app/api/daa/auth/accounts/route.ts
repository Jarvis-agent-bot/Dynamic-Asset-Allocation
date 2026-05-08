import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, ok } from "@/src/daa/api/routeHelpers";
import { createDaaAuthAccount, listDaaAuthAccounts } from "@/src/daa/auth/daaAuthStore";

export const runtime = "nodejs";

function isDbError(message: string): boolean {
  return /postgres|database|daa_db_url|not configured|connect|timeout|query|sql|pool/i.test(message);
}

function mapAccountError(error: unknown): Response {
  const message = String((error as { message?: unknown } | null)?.message || error || "");
  if (/unique constraint/i.test(message)) return fail("VALIDATION_FAILED", "account_already_exists", { status: 409 });
  if (/invalid username|missing username|missing password/i.test(message)) return fail("VALIDATION_FAILED", "invalid_account_payload", { status: 400 });
  if (isDbError(message)) return fail("DB_ERROR", "auth_backend_unavailable", { status: 503 });
  console.error("[auth.accounts] error:", message);
  return fail("INTERNAL_ERROR", "account_management_failed", { status: 500 });
}

export async function GET(req: Request) {
  const denied = await requireDaaAdminEditorAuth(req);
  if (denied) return denied;

  try {
    const accounts = await listDaaAuthAccounts();
    return ok({ accounts });
  } catch (error) {
    return mapAccountError(error);
  }
}

export async function POST(req: Request) {
  const denied = await requireDaaAdminEditorAuth(req);
  if (denied) return denied;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const username = (typeof body?.username === "string" ? body.username.trim() : "") ||
    (typeof body?.email === "string" ? body.email.trim() : "");
  const password = typeof body?.password === "string" ? body.password : "";
  const roles = Array.isArray(body?.roles) ? body.roles : ["viewer"];

  if (!username || !password) {
    return fail("VALIDATION_FAILED", "username and password are required", { status: 400 });
  }

  try {
    const account = await createDaaAuthAccount({ username, password, roles });
    return ok({ account }, undefined, { status: 201 });
  } catch (error) {
    return mapAccountError(error);
  }
}
