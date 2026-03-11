import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { preferAssetRowPriceV1 } from "@/src/daa/modules/workbench/preferAssetRowPriceV1";
import { upsertDaaAssetUniverseRowV1 } from "@/src/daa/store/daaStorePgV1";
import { parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchReadServiceV1";

export const runtime = "nodejs";

type Body = {
  symbol?: unknown;
  market?: unknown;
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
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const symbol = String(body?.symbol || "").trim().toUpperCase();
    const market = String(body?.market || "US").trim().toUpperCase() || "US";
    if (!symbol) {
      return failV1("VALIDATION_FAILED", "symbol is required", { status: 400 });
    }

    const saved = await upsertDaaAssetUniverseRowV1({
      symbol,
      market,
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

    const bootstrap = await buildWorkbenchBootstrapV1({ syncPrices: false });
    const row = bootstrap.assetUniverse.find((item) => item.assetKey === saved.assetKey);
    if (!row) {
      const parsed = parseDaaAssetKeyV1(saved.assetKey);
      return failV1("NOT_FOUND", `asset not found after upsert: ${parsed?.symbol || saved.assetKey}`, { status: 404 });
    }

    let resolvedRow = row;
    try {
      resolvedRow = await preferAssetRowPriceV1(row, "asset_upsert");
    } catch {
      resolvedRow = row;
    }
    return okV1({ row: resolvedRow });
  });
}
