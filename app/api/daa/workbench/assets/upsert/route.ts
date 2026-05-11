import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { preferAssetRowPrice } from "@/src/daa/modules/workbench/preferAssetRowPrice";
import { upsertDaaAssetUniverseRow } from "@/src/daa/store/daaStorePg";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type Body = {
  symbol?: unknown;
  market?: unknown;
  name?: unknown;
  displayNameZh?: unknown;
  currency?: unknown;
  assetClass?: unknown;
  region?: unknown;
  exchange?: unknown;
  instrumentType?: unknown;
  marketGroup?: unknown;
  watchEnabled?: unknown;
  watchTags?: unknown;
  targetWeightHint?: unknown;
  notes?: unknown;
  lastPrice?: unknown;
};

function toOptionalText(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const symbol = String(body?.symbol || "").trim().toUpperCase();
    const market = String(body?.market || "US").trim().toUpperCase() || "US";
    if (!symbol) {
      return fail("VALIDATION_FAILED", "symbol is required", { status: 400 });
    }

    const saved = await upsertDaaAssetUniverseRow({
      symbol,
      market,
      name: toOptionalText(body?.name) ?? null,
      displayNameZh: toOptionalText(body?.displayNameZh) ?? null,
      currency: toOptionalText(body?.currency),
      assetClass: toOptionalText(body?.assetClass),
      region: toOptionalText(body?.region),
      exchange: toOptionalText(body?.exchange),
      instrumentType: toOptionalText(body?.instrumentType),
      marketGroup: toOptionalText(body?.marketGroup),
      watchEnabled: body?.watchEnabled !== false,
      watchTags: Array.isArray(body?.watchTags) ? body?.watchTags.map(String) : [],
      targetWeightHint: Number(body?.targetWeightHint || 0),
      notes: body?.notes == null ? null : String(body.notes),
      lastPrice: Number(body?.lastPrice || 0),
    });

    const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
    const row = bootstrap.assetUniverse.find((item) => item.assetKey === saved.assetKey);
    if (!row) {
      const parsed = parseDaaAssetKey(saved.assetKey);
      return fail("NOT_FOUND", `asset not found after upsert: ${parsed?.symbol || saved.assetKey}`, { status: 404 });
    }

    let resolvedRow = row;
    try {
      resolvedRow = await preferAssetRowPrice(row, "asset_upsert");
    } catch (err) {
  logSwallowed("upsertRoute.resolveAsset", err);
      resolvedRow = row;
    }
    return ok({ row: resolvedRow });
  });
}
