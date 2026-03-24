import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { WorkbenchDomainError } from "@/src/daa/modules/workbench/workbenchErrors";
import { updateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

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
  selectedAssetSideKeys?: unknown;
};

function readCancelReason(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  return String(record.reason || "").trim();
}

export async function PATCH(req: Request, { params }: Params) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const payload = (body || {}) as Body;
    const selectedSymbols = Array.isArray(payload.selectedSymbols)
      ? payload.selectedSymbols.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
      : undefined;
    const selectedAssetSideKeys = Array.isArray(payload.selectedAssetSideKeys)
      ? payload.selectedAssetSideKeys.map((item) => String(item || "").trim()).filter(Boolean)
      : undefined;

    let data;
    try {
      data = await updateWorkbenchRebalanceCycle(params.id, {
        status: payload.status === "reviewing" ? "reviewing" : undefined,
        notes: payload.notes == null ? undefined : String(payload.notes || ""),
        cancel: payload.cancel ? { reason: readCancelReason(payload.cancel) } : undefined,
        selectedSymbols,
        selectedAssetSideKeys,
      });
    } catch (error) {
      if (error instanceof WorkbenchDomainError) {
        return fail("VALIDATION_FAILED", error.message, {
          status: error.status,
          details: {
            code: error.code,
            ...(error.details || {}),
          },
        });
      }
      throw error;
    }
    return ok(data);
  });
}
