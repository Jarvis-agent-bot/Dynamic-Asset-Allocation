import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { mapDaaAuthAccountError } from "@/src/daa/auth/daaAuthRouteErrors";
import {
  deleteDaaAuthAccount,
  resetDaaAuthAccountPassword,
  updateDaaAuthAccount,
  type DaaAuthAccountStatus,
  type DaaAuthRole,
} from "@/src/daa/auth/daaAuthStore";

export const runtime = "nodejs";

type PatchAccountBody = {
  roles?: unknown;
  status?: unknown;
  password?: unknown;
};

function normalizeStatus(raw: unknown): DaaAuthAccountStatus | undefined {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "active" || v === "inactive") return v;
  return undefined;
}

export async function PATCH(req: Request, context: { params: { accountId: string } }) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const accountId = String(context.params.accountId || "").trim();
    if (!accountId) return fail("VALIDATION_FAILED", "missing accountId", { status: 400 });

    const body = await readJsonBody<PatchAccountBody>(req);

    const roles = Array.isArray(body?.roles) ? body.roles as DaaAuthRole[] : undefined;
    const status = body && "status" in body ? normalizeStatus(body.status) : undefined;
    const password = typeof body?.password === "string" ? body.password : "";

    if (body && "status" in body && !status) {
      return fail("VALIDATION_FAILED", "invalid status", { status: 400 });
    }
    if (!roles && !status && !password.trim()) {
      return fail("VALIDATION_FAILED", "nothing to update", { status: 400 });
    }

    try {
      const updated = await updateDaaAuthAccount({ accountId, roles, status });
      if (!updated.ok) return fail("NOT_FOUND", "account_not_found", { status: 404 });

      if (password.trim()) {
        const passwordReset = await resetDaaAuthAccountPassword({ accountId, password });
        if (!passwordReset.ok) return fail("NOT_FOUND", "account_not_found", { status: 404 });
        return ok({ account: passwordReset.account });
      }

      return ok({ account: updated.account });
    } catch (error) {
      return mapDaaAuthAccountError(error, "auth.account");
    }
  });
}

export async function DELETE(req: Request, context: { params: { accountId: string } }) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const accountId = String(context.params.accountId || "").trim();
    if (!accountId) return fail("VALIDATION_FAILED", "missing accountId", { status: 400 });

    const ctx = await getDaaAuthContextFromRequest(req, { touch: false }).catch(() => null);
    if (ctx?.account.accountId === accountId) {
      return fail("VALIDATION_FAILED", "cannot_delete_current_account", { status: 400 });
    }

    try {
      const deleted = await deleteDaaAuthAccount({ accountId });
      if (!deleted.ok) return fail("NOT_FOUND", "account_not_found", { status: 404 });
      return ok({ deleted: true });
    } catch (error) {
      return mapDaaAuthAccountError(error, "auth.account");
    }
  });
}
