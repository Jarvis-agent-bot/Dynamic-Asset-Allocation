import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { preferAssetRowPrice } from "@/src/daa/modules/workbench/preferAssetRowPrice";
import { patchDaaAssetUniverseRow } from "@/src/daa/store/daaStorePg";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type Body = {
  watchEnabled?: unknown;
  watchTags?: unknown;
  targetWeightHint?: unknown;
  holdingQty?: unknown;
  holdingPrice?: unknown;
  costBasis?: unknown;
  notes?: unknown;
  name?: unknown;
  displayNameZh?: unknown;
  assetClass?: unknown;
  region?: unknown;
  exchange?: unknown;
  instrumentType?: unknown;
  marketGroup?: unknown;
  lastPrice?: unknown;
};

type Ctx = {
  params: {
    assetKey: string;
  };
};

export async function PATCH(req: Request, ctx: Ctx) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const parsed = parseDaaAssetKey(ctx.params?.assetKey);
    if (!parsed) return fail("VALIDATION_FAILED", "assetKey is required", { status: 400 });

    const body = await readJsonBody<Body>(req);
    const saved = await patchDaaAssetUniverseRow({
      assetKey: `${parsed.market}::${parsed.symbol}`,
      watchEnabled: body?.watchEnabled == null ? undefined : Boolean(body?.watchEnabled),
      watchTags: Array.isArray(body?.watchTags) ? body.watchTags.map(String) : undefined,
      targetWeightHint: body?.targetWeightHint == null ? undefined : Number(body.targetWeightHint),
      holdingQty: body?.holdingQty == null ? undefined : Number(body.holdingQty),
      holdingPrice: body?.holdingPrice == null ? undefined : Number(body.holdingPrice),
      costBasis: body?.costBasis === undefined ? undefined : (body.costBasis == null ? null : Number(body.costBasis)),
      notes: body?.notes === undefined ? undefined : (body?.notes == null ? null : String(body.notes)),
      name: body?.name === undefined ? undefined : (body?.name == null ? null : String(body.name)),
      displayNameZh: body?.displayNameZh === undefined ? undefined : (body?.displayNameZh == null ? null : String(body.displayNameZh)),
      assetClass: body?.assetClass == null ? undefined : String(body.assetClass),
      region: body?.region == null ? undefined : String(body.region),
      exchange: body?.exchange == null ? undefined : String(body.exchange),
      instrumentType: body?.instrumentType == null ? undefined : String(body.instrumentType),
      marketGroup: body?.marketGroup == null ? undefined : String(body.marketGroup),
      lastPrice: body?.lastPrice == null ? undefined : Number(body.lastPrice),
    });

    const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
    const row = bootstrap.assetUniverse.find((item) => item.assetKey === saved.assetKey);
    if (!row) {
      return fail("NOT_FOUND", `asset not found after patch: ${saved.assetKey}`, { status: 404 });
    }

    let resolvedRow = row;
    try {
      resolvedRow = await preferAssetRowPrice(row, "asset_patch");
    } catch (err) {
  logSwallowed("assetRoute.resolveAsset", err);
      resolvedRow = row;
    }
    return ok({ row: resolvedRow });
  });
}
