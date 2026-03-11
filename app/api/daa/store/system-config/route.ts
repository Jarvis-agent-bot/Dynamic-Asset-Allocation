import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { patchDaaSystemConfigV2, saveDaaSystemConfigV2, getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";
import type { DaaSystemConfigPatchV2 } from "@/src/daa/config/systemConfigV2";
import { buildDevMemSystemConfigEnvelopeV1, shouldUseDevMemFallbackV1 } from "@/src/daa/devMemFallbackV1";

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

function isPatchList(value: unknown): value is DaaSystemConfigPatchV2[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const patch = item as { path?: unknown };
    const path = String(patch.path || "").trim();
    return Boolean(path);
  });
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallbackV1(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponseV1(authResult);
    if (denied) {
      if (shouldUseDevMemFallbackV1()) return okV1(buildDevMemSystemConfigEnvelopeV1());
      return denied;
    }

    try {
      const row = await getDaaSystemConfigV2();
      return okV1({
        version: row.version,
        updatedAt: row.updatedAt,
        config: row.config,
      });
    } catch (error) {
      if (shouldUseDevMemFallbackV1(error)) return okV1(buildDevMemSystemConfigEnvelopeV1());
      throw error;
    }
  });
}

export async function PATCH(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<PatchBody>(req);
    const baseVersion = parseBaseVersion(body?.baseVersion);

    try {
      if (isPatchList(body?.patches)) {
        const saved = await patchDaaSystemConfigV2({
          patches: body.patches,
          baseVersion,
        });
        return okV1({ version: saved.version, updatedAt: saved.updatedAt, config: saved.config });
      }

      if (body?.config && typeof body.config === "object" && !Array.isArray(body.config)) {
        const saved = await saveDaaSystemConfigV2({ config: body.config, baseVersion });
        return okV1({ version: saved.version, updatedAt: saved.updatedAt, config: saved.config });
      }

      return failV1("VALIDATION_FAILED", "patches must be a non-empty array or config must be an object", { status: 400 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (message.startsWith("system_config_version_conflict:")) {
        const latestVersion = Number(message.split(":")[1] || 0) || 0;
        return failV1("VERSION_CONFLICT", "system config version conflict", {
          status: 409,
          details: { latestVersion },
        });
      }
      throw error;
    }
  });
}
