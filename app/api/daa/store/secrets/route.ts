import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  DAA_SECRET_KEY_DEFINITIONS,
  deleteSecret,
  listSecretStatuses,
  writeSecret,
  type DaaSecretKey,
} from "@/src/daa/config/secretsManager";

export const runtime = "nodejs";

function isValidSecretKey(key: unknown): key is DaaSecretKey {
  return typeof key === "string" && DAA_SECRET_KEY_DEFINITIONS.some((definition) => definition.key === key);
}

/** GET — list all secrets (masked). */
export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const secrets = await listSecretStatuses();
    return ok({ secrets });
  });
}

/** PUT — write or delete a single secret. */
export async function PUT(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ key?: unknown; value?: unknown }>(req);
    if (!body || !isValidSecretKey(body.key)) {
      return fail("VALIDATION_FAILED", "invalid or missing secret key", { status: 400 });
    }

    const definition = DAA_SECRET_KEY_DEFINITIONS.find((item) => item.key === body.key);
    if (definition && "readOnly" in definition && definition.readOnly) {
      return fail("VALIDATION_FAILED", `secret ${body.key} is read-only (set via env var)`, { status: 400 });
    }

    const value = String(body.value ?? "").trim();
    await writeSecret(body.key, value);

    const secrets = await listSecretStatuses();
    return ok({ secrets });
  });
}

/** DELETE — remove a secret from DB. */
export async function DELETE(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ key?: unknown }>(req);
    if (!body || !isValidSecretKey(body.key)) {
      return fail("VALIDATION_FAILED", "invalid or missing secret key", { status: 400 });
    }

    await deleteSecret(body.key);

    const secrets = await listSecretStatuses();
    return ok({ secrets });
  });
}
