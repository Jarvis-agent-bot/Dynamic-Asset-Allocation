import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { executeDaaTradeBasketV1, getActiveDaaTradeBasketV1, listDaaTradeTicketsV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const activeQueue = await getActiveDaaTradeBasketV1();
    if (!activeQueue) {
      return okV1({
        queueId: null,
        queueStatus: null,
        results: [],
        summary: { executed: 0, rejected: 0, total: 0 },
        logs: [],
      });
    }

    const result = await executeDaaTradeBasketV1(activeQueue.basketId);
    const latestQueue = await getActiveDaaTradeBasketV1();
    const logs = await listDaaTradeTicketsV1({
      limit: 200,
    });

    return okV1({
      queueId: latestQueue?.basketId ?? null,
      queueStatus: latestQueue?.status ?? null,
      results: result.results,
      summary: {
        executed: result.results.filter((item) => item.status === "executed").length,
        rejected: result.results.filter((item) => item.status === "rejected").length,
        total: result.results.length,
      },
      logs: logs.filter((item) => item.status !== "ready"),
    });
  });
}
