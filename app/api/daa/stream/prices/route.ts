/**
 * SSE 实时价格流端点。
 * 每秒从 DB 缓存读取价格变化并推送 diff 到客户端。
 * 不调用外部 API — 零额外市场数据压力。
 *
 * GET /api/daa/stream/prices?assets=US:AAPL,US:MSFT,...
 */

import { fail } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { createPriceStream } from "@/src/daa/stream/priceStreamService";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ASSETS = 200;

export async function GET(req: Request) {
  // 认证检查
  const authErr = await requireDaaAdminViewerAuth(req);
  if (authErr) return authErr;

  // 解析资产列表
  const url = new URL(req.url);
  const assetsParam = (url.searchParams.get("assets") || "").trim();

  if (!assetsParam) {
    return fail("VALIDATION_FAILED", "assets 参数必填 (逗号分隔的 assetKey 列表)", { status: 400 });
  }

  const assetKeys = assetsParam
    .split(",")
    .map((k) => k.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_ASSETS);

  if (assetKeys.length === 0) {
    return fail("VALIDATION_FAILED", "至少需要一个有效的 assetKey", { status: 400 });
  }

  try {
    const stream = createPriceStream(assetKeys, 1000, 5 * 60 * 1000);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Nginx 不缓冲
      },
    });
  } catch (err) {
    logSwallowed("priceStreamRoute.createStream", err);
    return fail("INTERNAL_ERROR", "stream_creation_failed", { status: 500 });
  }
}
