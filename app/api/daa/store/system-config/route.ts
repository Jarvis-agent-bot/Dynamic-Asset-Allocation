import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { patchDaaSystemConfig, saveDaaSystemConfig, getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import type { DaaSystemConfigPatch } from "@/src/daa/config/systemConfig";
import { buildDevMemSystemConfigEnvelope, shouldUseDevMemFallback } from "@/src/daa/devMemFallback";

export const runtime = "nodejs";

type PatchBody = {
  baseVersion?: unknown;
  patches?: unknown;
  config?: unknown;
};

function parseBaseVersion(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.trunc(parsed);
}

function isPatchList(value: unknown): value is DaaSystemConfigPatch[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const patch = item as { path?: unknown };
    const path = String(patch.path || "").trim();
    return Boolean(path);
  });
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallback(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponse(authResult);
    if (denied) {
      if (shouldUseDevMemFallback()) return ok(buildDevMemSystemConfigEnvelope());
      return denied;
    }

    try {
      const row = await getDaaSystemConfig();
      return ok({
        version: row.version,
        updatedAt: row.updatedAt,
        config: row.config,
      });
    } catch (error) {
      if (shouldUseDevMemFallback(error)) return ok(buildDevMemSystemConfigEnvelope());
      throw error;
    }
  });
}

export async function PATCH(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<PatchBody>(req);
    const baseVersion = parseBaseVersion(body?.baseVersion);

    try {
      if (isPatchList(body?.patches)) {
        const saved = await patchDaaSystemConfig({
          patches: body.patches,
          baseVersion,
        });
        return ok({ version: saved.version, updatedAt: saved.updatedAt, config: saved.config });
      }

      if (body?.config && typeof body.config === "object" && !Array.isArray(body.config)) {
        const saved = await saveDaaSystemConfig({ config: body.config, baseVersion });
        return ok({ version: saved.version, updatedAt: saved.updatedAt, config: saved.config });
      }

      return fail("VALIDATION_FAILED", "patches must be a non-empty array or config must be an object", { status: 400 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (message.startsWith("system_config_version_conflict:")) {
        const latestVersion = Number(message.split(":")[1] || 0) || 0;
        return fail("VERSION_CONFLICT", "system config version conflict", {
          status: 409,
          details: { latestVersion },
        });
      }
      throw error;
    }
  });
}
