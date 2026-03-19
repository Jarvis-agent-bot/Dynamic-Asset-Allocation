import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildNotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import { listNotificationDeliveryLogs, type DaaNotificationChannel } from "@/src/daa/store/notificationDeliveryLogRepo";

export const runtime = "nodejs";

function toLimit(value: string | null): number {
  const parsed = Number(value || 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function normalizeChannel(value: string | null): DaaNotificationChannel | null {
  if (!value) return null;
  return value.trim().toLowerCase() === "feishu" ? "feishu" : value.trim().toLowerCase() === "telegram" ? "telegram" : null;
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = toLimit(url.searchParams.get("limit"));
    const channel = normalizeChannel(url.searchParams.get("channel"));
    const [entries, summary] = await Promise.all([
      listNotificationDeliveryLogs({ limit, channel }),
      buildNotificationStatusSummary(),
    ]);

    return ok({ entries, summary });
  });
}
