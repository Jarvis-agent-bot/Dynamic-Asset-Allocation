import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getDaaRebalanceCycleV1 } from "@/src/daa/store/daaStorePgV1";
import { updateWorkbenchRebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";

export const runtime = "nodejs";

type Params = {
  params: {
    id: string;
  };
};

type Body = {
  status?: unknown;
  notes?: unknown;
  cancel?: unknown;
  selectedSymbols?: unknown;
};

function readCancelReason(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  return String(record.reason || "").trim();
}

export async function GET(req: Request, { params }: Params) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const cycle = await getDaaRebalanceCycleV1(params.id);
    if (!cycle) {
      return failV1("NOT_FOUND", "cycle not found", { status: 404 });
    }
    return okV1(cycle);
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const payload = (body || {}) as Body;
    const selectedSymbols = Array.isArray(payload.selectedSymbols)
      ? payload.selectedSymbols.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
      : undefined;

    const data = await updateWorkbenchRebalanceCycleV1(params.id, {
      status: payload.status === "reviewing" ? "reviewing" : undefined,
      notes: payload.notes == null ? undefined : String(payload.notes || ""),
      cancel: payload.cancel ? { reason: readCancelReason(payload.cancel) } : undefined,
      selectedSymbols,
    });
    return okV1(data);
  });
}
