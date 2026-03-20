import { ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { syncBrokerOrders, type BrokerOrderSyncScope } from "@/src/daa/broker";
import { requireCronAuth } from "@/src/daa/cron/auth";

export const runtime = "nodejs";

function normalizeScope(value: string | null): BrokerOrderSyncScope {
  const text = String(value || "").trim().toLowerCase();
  if (text === "recent") return "recent";
  return "open";
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) return denied;
    const { searchParams } = new URL(req.url);
    return ok(await syncBrokerOrders({
      scope: normalizeScope(searchParams.get("scope")),
    }));
  });
}
