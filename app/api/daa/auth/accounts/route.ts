import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { mapDaaAuthAccountError } from "@/src/daa/auth/daaAuthRouteErrors";
import { createDaaAuthAccount, listDaaAuthAccounts, type DaaAuthRole } from "@/src/daa/auth/daaAuthStore";

export const runtime = "nodejs";

type CreateAccountBody = {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  roles?: unknown;
};

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    try {
      const accounts = await listDaaAuthAccounts();
      return ok({ accounts });
    } catch (error) {
      return mapDaaAuthAccountError(error, "auth.accounts");
    }
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<CreateAccountBody>(req);

    const username = (typeof body?.username === "string" ? body.username.trim() : "") ||
      (typeof body?.email === "string" ? body.email.trim() : "");
    const password = typeof body?.password === "string" ? body.password : "";
    const roles: DaaAuthRole[] = Array.isArray(body?.roles) ? body.roles as DaaAuthRole[] : ["viewer"];

    if (!username || !password) {
      return fail("VALIDATION_FAILED", "username and password are required", { status: 400 });
    }

    try {
      const account = await createDaaAuthAccount({ username, password, roles });
      return ok({ account }, undefined, { status: 201 });
    } catch (error) {
      return mapDaaAuthAccountError(error, "auth.accounts");
    }
  });
}
