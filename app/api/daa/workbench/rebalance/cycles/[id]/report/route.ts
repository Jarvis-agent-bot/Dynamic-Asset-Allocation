import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getWorkbenchRebalanceCycleReport } from "@/src/daa/modules/workbench/workbenchReadService";

export const runtime = "nodejs";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(req: Request, { params }: Params) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;
    const report = await getWorkbenchRebalanceCycleReport(params.id);
    return ok({ report });
  });
}
