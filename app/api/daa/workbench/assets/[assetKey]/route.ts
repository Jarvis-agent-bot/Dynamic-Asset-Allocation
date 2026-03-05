import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { patchDaaAssetUniverseRowV1 } from "@/src/daa/store/daaStorePgV1";
import { parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";

export const runtime = "nodejs";

type Body = {
  watchEnabled?: unknown;
  watchTags?: unknown;
  targetWeightHint?: unknown;
  holdingQty?: unknown;
  holdingPrice?: unknown;
  costBasis?: unknown;
  notes?: unknown;
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
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const parsed = parseDaaAssetKeyV1(ctx.params?.assetKey);
    if (!parsed) return failV1("VALIDATION_FAILED", "assetKey is required", { status: 400 });

    const body = await readJsonBodyV1<Body>(req);
    const saved = await patchDaaAssetUniverseRowV1({
      assetKey: `${parsed.market}::${parsed.symbol}`,
      watchEnabled: body?.watchEnabled == null ? undefined : Boolean(body?.watchEnabled),
      watchTags: Array.isArray(body?.watchTags) ? body.watchTags.map(String) : undefined,
      targetWeightHint: body?.targetWeightHint == null ? undefined : Number(body.targetWeightHint),
      holdingQty: body?.holdingQty == null ? undefined : Number(body.holdingQty),
      holdingPrice: body?.holdingPrice == null ? undefined : Number(body.holdingPrice),
      costBasis: body?.costBasis === undefined ? undefined : (body.costBasis == null ? null : Number(body.costBasis)),
      notes: body?.notes === undefined ? undefined : (body?.notes == null ? null : String(body.notes)),
      assetClass: body?.assetClass == null ? undefined : String(body.assetClass),
      region: body?.region == null ? undefined : String(body.region),
      exchange: body?.exchange == null ? undefined : String(body.exchange),
      instrumentType: body?.instrumentType == null ? undefined : String(body.instrumentType),
      marketGroup: body?.marketGroup == null ? undefined : String(body.marketGroup),
      lastPrice: body?.lastPrice == null ? undefined : Number(body.lastPrice),
    });

    const bootstrap = await buildWorkbenchBootstrapV1({ syncPrices: false });
    const row = bootstrap.assetUniverse.find((item) => item.assetKey === saved.assetKey);
    if (!row) {
      return failV1("NOT_FOUND", `asset not found after patch: ${saved.assetKey}`, { status: 404 });
    }
    return okV1({ row });
  });
}
