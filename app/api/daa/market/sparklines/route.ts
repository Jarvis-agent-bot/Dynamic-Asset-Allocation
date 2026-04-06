import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { checkRateLimit } from "@/src/daa/api/rateLimit";
import { fetchSparklinesBatch } from "@/src/daa/modules/marketCache/priceSeriesCache";

export const runtime = "nodejs";

/**
 * GET /api/daa/market/sparklines?symbols=AAPL,NVDA,0388.HK&days=30
 *
 * 批量返回多个 symbol 的迷你走势数据。
 * 替代前端 N+1 的 per-row price-series 请求。
 */
export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    if (!checkRateLimit("sparklines", req, { windowMs: 60_000, max: 20 })) {
      return fail("RATE_LIMITED", "请求过于频繁", { status: 429 });
    }

    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get("symbols") || "";
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days")) || 30));

    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30); // 最多 30 个

    if (symbols.length === 0) {
      return fail("VALIDATION_FAILED", "symbols 参数为空", { status: 400 });
    }

    const sparklines = await fetchSparklinesBatch(symbols, days);

    return ok({ sparklines, count: Object.keys(sparklines).length });
  });
}
