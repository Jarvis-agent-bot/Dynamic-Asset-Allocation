import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import {
  getWatchlistAutoEntry,
  updateWatchlistAutoEntry,
  type WatchlistEntryRulesOverride,
} from "@/src/daa/store/watchlistAutoEntryStore";

export const runtime = "nodejs";

type Ctx = {
  params: {
    assetKey: string;
  };
};

type PatchBody = {
  autoEntryEnabled?: unknown;
  entryTargetWeightPct?: unknown;
  entryRules?: unknown;
  entryCooldownDays?: unknown;
};

function normalizeRules(value: unknown): WatchlistEntryRulesOverride | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const out: WatchlistEntryRulesOverride = {};
  if (raw.minTechnicalScore != null) out.minTechnicalScore = Number(raw.minTechnicalScore);
  if (raw.minValuationScore != null) out.minValuationScore = Number(raw.minValuationScore);
  if (raw.minFusionScore != null) out.minFusionScore = Number(raw.minFusionScore);
  if (raw.requireStrongMomentum != null) out.requireStrongMomentum = Boolean(raw.requireStrongMomentum);
  return Object.keys(out).length === 0 ? null : out;
}

export async function GET(req: Request, ctx: Ctx) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const parsed = parseDaaAssetKey(ctx.params?.assetKey);
    if (!parsed) return fail("VALIDATION_FAILED", "assetKey is required", { status: 400 });

    const row = await getWatchlistAutoEntry(`${parsed.market}::${parsed.symbol}`);
    return ok({ row });
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const parsed = parseDaaAssetKey(ctx.params?.assetKey);
    if (!parsed) return fail("VALIDATION_FAILED", "assetKey is required", { status: 400 });

    const body = await readJsonBody<PatchBody>(req);
    const updated = await updateWatchlistAutoEntry(`${parsed.market}::${parsed.symbol}`, {
      autoEntryEnabled: body?.autoEntryEnabled == null ? undefined : Boolean(body.autoEntryEnabled),
      entryTargetWeightPct: body?.entryTargetWeightPct === undefined
        ? undefined
        : (body.entryTargetWeightPct == null ? null : Number(body.entryTargetWeightPct)),
      entryRules: normalizeRules(body?.entryRules),
      entryCooldownDays: body?.entryCooldownDays == null ? undefined : Number(body.entryCooldownDays),
    });
    if (!updated) {
      return fail("NOT_FOUND", `asset not found in watchlist: ${parsed.market}:${parsed.symbol}`, { status: 404 });
    }
    return ok({ row: updated });
  });
}
