import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { normalizeRebalanceTriggerSource } from "@/src/daa/modules/rebalance/rebalanceTypes";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

export const runtime = "nodejs";

type Body = {
  triggerSource?: unknown;
  triggerReason?: unknown;
  manual?: unknown;
  targetWeightOverrides?: unknown;
};

function toTargetWeightOverrides(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = String(rawKey || "").trim();
    const weight = Number(rawValue);
    if (!key || !Number.isFinite(weight) || weight < 0) continue;
    out[key] = Math.max(0, weight);
  }
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const payload = (body || {}) as Body;
    const data = await generateWorkbenchRebalanceCycle({
      triggerSource: normalizeRebalanceTriggerSource(payload.triggerSource),
      triggerReason: String(payload.triggerReason || "").trim(),
      manual: payload.manual === true || payload.manual === "1" || payload.manual === "true",
      targetWeightOverrides: toTargetWeightOverrides(payload.targetWeightOverrides),
    });
    return ok(data);
  });
}
