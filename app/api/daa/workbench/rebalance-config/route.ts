import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { DEFAULT_ANALYSIS_FOCUS_ } from "@/src/daa/llm/analysisFocusDefaults";
import { getDaaSystemConfig, patchDaaSystemConfig } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

type Body = {
  mode?: unknown;
  autoAnalysisEnabled?: unknown;
  analysisTimeUtc?: unknown;
  timezone?: unknown;
  analysisFocus?: unknown;
  baseVersion?: unknown;
};

function toMode(value: unknown): "manual" | "auto" | null {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "manual" || mode === "auto") return mode;
  return null;
}

function toBool(value: unknown): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return undefined;
}

function toBaseVersion(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.trunc(n);
}

function toTimeUtc(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!matched) return null;
  return `${matched[1]}:${matched[2]}`;
}

function toView(config: {
  autoGenerateEnabled: boolean;
  analysisTimeUtc: string;
  timezone: string;
  analysisFocus: string;
}) {
  return {
    mode: config.autoGenerateEnabled ? "auto" : "manual",
    autoAnalysisEnabled: Boolean(config.autoGenerateEnabled),
    analysisTimeUtc: String(config.analysisTimeUtc || "00:20"),
    timezone: String(config.timezone || "Asia/Shanghai"),
    analysisFocus: String(config.analysisFocus || DEFAULT_ANALYSIS_FOCUS_).trim() || DEFAULT_ANALYSIS_FOCUS_,
  };
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const row = await getDaaSystemConfig();
    return ok(toView(row.config.rebalanceStrategy));
  });
}

export async function PATCH(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const patches: Array<{ path: string; value: unknown }> = [];

    if (body?.mode != null) {
      const mode = toMode(body.mode);
      if (!mode) {
        return fail("VALIDATION_FAILED", "mode must be manual or auto", { status: 400 });
      }
      patches.push({ path: "/rebalanceStrategy/autoGenerateEnabled", value: mode === "auto" });
    }

    if (body?.autoAnalysisEnabled != null) {
      const enabled = toBool(body.autoAnalysisEnabled);
      if (enabled == null) {
        return fail("VALIDATION_FAILED", "autoAnalysisEnabled must be boolean", { status: 400 });
      }
      patches.push({ path: "/rebalanceStrategy/autoGenerateEnabled", value: enabled });
    }

    if (body?.analysisTimeUtc != null) {
      const analysisTimeUtc = toTimeUtc(body.analysisTimeUtc);
      if (!analysisTimeUtc) {
        return fail("VALIDATION_FAILED", "analysisTimeUtc must be HH:MM", { status: 400 });
      }
      patches.push({ path: "/rebalanceStrategy/analysisTimeUtc", value: analysisTimeUtc });
    }

    if (body?.timezone != null) {
      const timezone = String(body.timezone || "").trim();
      if (!timezone) {
        return fail("VALIDATION_FAILED", "timezone must not be empty", { status: 400 });
      }
      patches.push({ path: "/rebalanceStrategy/timezone", value: timezone });
    }

    if (body?.analysisFocus != null) {
      const analysisFocus = String(body.analysisFocus || "").trim() || DEFAULT_ANALYSIS_FOCUS_;
      patches.push({ path: "/rebalanceStrategy/analysisFocus", value: analysisFocus });
    }

    if (patches.length <= 0) {
      const current = await getDaaSystemConfig();
      return ok(toView(current.config.rebalanceStrategy));
    }

    try {
      const saved = await patchDaaSystemConfig({
        patches,
        baseVersion: toBaseVersion(body?.baseVersion),
      });
      return ok(toView(saved.config.rebalanceStrategy));
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
