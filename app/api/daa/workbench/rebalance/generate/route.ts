import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { generateWorkbenchRebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchRebalanceCycleServiceV1";

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
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const payload = (body || {}) as Body;
    const data = await generateWorkbenchRebalanceCycleV1({
      triggerSource: toTriggerSource(payload.triggerSource),
      triggerReason: String(payload.triggerReason || "").trim(),
      analysisFocus: String(payload.analysisFocus || "").trim() || undefined,
      manual: payload.manual === true || payload.manual === "1" || payload.manual === "true",
    });
    return okV1(data);
  });
}
