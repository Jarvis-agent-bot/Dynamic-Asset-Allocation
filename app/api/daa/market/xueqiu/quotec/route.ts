import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";

import { fetchTextWithTimeout, getProviderErrorStatus, mustGetEnv, parseXueqiuCookie } from "../../_lib/providerAdapters";

export const runtime = "nodejs";

function parseJsonBestEffort(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    try {
      const url = new URL(req.url);
      const symbol = url.searchParams.get("symbol")?.trim();
      if (!symbol) {
        return fail("VALIDATION_FAILED", "missing symbol", { status: 400 });
      }

      const cookie = parseXueqiuCookie(mustGetEnv("XUEQIU_TOKEN"));

      const upstream = new URL("https://stock.xueqiu.com/v5/stock/realtime/quotec.json");
      upstream.searchParams.set("symbol", symbol);
      upstream.searchParams.set("_", String(Date.now()));

      const response = await fetchTextWithTimeout(upstream, {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          cookie,
          origin: "https://xueqiu.com",
          referer: `https://xueqiu.com/S/${symbol}`,
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      });

      const text = await response.text();
      if (!response.ok) {
        return fail("INTERNAL_ERROR", "xueqiu upstream error", {
          status: 502,
          details: {
            status: response.status,
          },
        });
      }

      return ok({
        source: "xueqiu",
        symbol,
        payload: parseJsonBestEffort(text),
      });
    } catch (error) {
      return fail("INTERNAL_ERROR", "xueqiu quotec fetch failed", {
        status: getProviderErrorStatus(error),
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
