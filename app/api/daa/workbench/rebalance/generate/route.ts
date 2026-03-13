import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

export const runtime = "nodejs";

type Body = {
  triggerSource?: unknown;
  triggerReason?: unknown;
  analysisFocus?: unknown;
  manual?: unknown;
};

function toTriggerSource(value: unknown): "calendar" | "drift" | "manual" | "risk" | undefined {
  const text = String(value || "").trim().toLowerCase();
  if (text === "calendar") return "calendar";
  if (text === "drift") return "drift";
  if (text === "manual") return "manual";
  if (text === "risk") return "risk";
  return undefined;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const payload = (body || {}) as Body;
    const data = await generateWorkbenchRebalanceCycle({
      triggerSource: toTriggerSource(payload.triggerSource),
      triggerReason: String(payload.triggerReason || "").trim(),
      analysisFocus: String(payload.analysisFocus || "").trim() || undefined,
      manual: payload.manual === true || payload.manual === "1" || payload.manual === "true",
    });
    return ok(data);
  });
}
