import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { executeTradeViaGateway } from "@/src/daa/gateway";
import { ManualTradeServiceError } from "@/src/daa/modules/workbench/manualTradeService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody(req);
    let execution;
    try {
      execution = await executeTradeViaGateway({ request: body || {} });
    } catch (error) {
      if (error instanceof ManualTradeServiceError) {
        return fail(error.code as never, error.message, {
          status: error.status,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      throw error;
    }

    return ok({
      item: execution.item,
      result: execution.result,
      summary: execution.summary,
      logs: execution.logs,
      broker: execution.broker,
    });
  });
}
