import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getWorkbenchRebalanceCycleReportV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";

export const runtime = "nodejs";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(req: Request, { params }: Params) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;
    const report = await getWorkbenchRebalanceCycleReportV1(params.id);
    return okV1({ report });
  });
}
