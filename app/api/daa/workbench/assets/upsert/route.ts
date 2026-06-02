import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { preferAssetRowPrice } from "@/src/daa/modules/workbench/preferAssetRowPrice";
import { upsertDaaAssetUniverseRow } from "@/src/daa/store/daaStorePg";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { TargetWeightAuditSource } from "@/src/daa/store/targetWeightAuditStore";

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
  targetWeightAudit?: unknown;
};

const TARGET_WEIGHT_AUDIT_SOURCES = new Set<TargetWeightAuditSource>([
  "manual_asset_patch",
  "asset_upsert",
  "agent_target_weight_pool",
  "rebalance_execution",
  "target_allocation_apply",
  "portfolio_template_apply",
  "strategy_lab_apply",
  "candidate_assets_replace",
  "system",
]);

function toOptionalText(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function readTargetWeightAudit(value: unknown): {
  source?: TargetWeightAuditSource;
  reason?: string | null;
  actor?: string | null;
  agentRunId?: string | null;
  cycleId?: string | null;
  payload?: Record<string, unknown> | null;
} | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const sourceRaw = String(raw.source || "").trim() as TargetWeightAuditSource;
  return {
    source: TARGET_WEIGHT_AUDIT_SOURCES.has(sourceRaw) ? sourceRaw : undefined,
    reason: raw.reason == null ? undefined : String(raw.reason),
    actor: raw.actor == null ? undefined : String(raw.actor),
    agentRunId: raw.agentRunId == null ? undefined : String(raw.agentRunId),
    cycleId: raw.cycleId == null ? undefined : String(raw.cycleId),
    payload: raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload)
      ? raw.payload as Record<string, unknown>
      : undefined,
  };
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
      targetWeightAudit: readTargetWeightAudit(body?.targetWeightAudit),
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
