import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { extractDividendsFromRawPayloads } from "@/src/daa/modules/dividend/dividendExtractor";
import { getDividendSummary, listDividendHistory } from "@/src/daa/modules/dividend/dividendService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "summary";

    if (action === "history") {
      const symbol = url.searchParams.get("symbol") || undefined;
      const records = await listDividendHistory({ symbol, limit: 100 });
      return ok({ records });
    }

    const summary = await getDividendSummary();
    return ok({ summary });
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    let body: any = null;
    try { body = await req.json(); } catch { body = {}; }

    const action = typeof body?.action === "string" ? body.action : "extract";

    if (action === "extract") {
      const result = await extractDividendsFromRawPayloads({
        sinceDays: Number(body?.sinceDays) || 90,
      });
      return ok(result);
    }

    if (action === "credit") {
      // This would need the appendCashLedger function - simplified for now
      // In production, this would be called from the cron job
      return ok({ message: "Use cron to credit dividends" });
    }

    return ok({ message: "unknown action" });
  });
}
