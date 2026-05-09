import { fail } from "@/src/daa/api/routeHelpers";

function isDbError(message: string): boolean {
  return /postgres|database|daa_db_url|not configured|connect|timeout|query|sql|pool/i.test(message);
}

export function mapDaaAuthAccountError(error: unknown, logLabel: string): Response {
  const message = String((error as { message?: unknown } | null)?.message || error || "");
  if (isDbError(message)) return fail("DB_ERROR", "auth_backend_unavailable", { status: 503 });
  if (/unique constraint|duplicate key/i.test(message)) return fail("VALIDATION_FAILED", "account_already_exists", { status: 409 });
  if (/invalid username|missing username|missing password|invalid role|invalid status/i.test(message)) {
    return fail("VALIDATION_FAILED", "invalid_account_payload", { status: 400 });
  }
  console.error(`[${logLabel}] error:`, message);
  return fail("INTERNAL_ERROR", "account_management_failed", { status: 500 });
}
