import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";

import { fetchTextWithTimeoutV0, getProviderErrorStatusV0, mustGetEnvV0, parseXueqiuCookieV0 } from "../../_lib/providerAdaptersV0";

export const runtime = "nodejs";

function parseJsonBestEffortV1(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    try {
      const url = new URL(req.url);
      const symbol = url.searchParams.get("symbol")?.trim();
      if (!symbol) {
        return failV1("VALIDATION_FAILED", "missing symbol", { status: 400 });
      }

      const cookie = parseXueqiuCookieV0(mustGetEnvV0("XUEQIU_TOKEN"));

      const upstream = new URL("https://stock.xueqiu.com/v5/stock/realtime/quotec.json");
      upstream.searchParams.set("symbol", symbol);
      upstream.searchParams.set("_", String(Date.now()));

      const response = await fetchTextWithTimeoutV0(upstream, {
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
        return failV1("INTERNAL_ERROR", "xueqiu upstream error", {
          status: 502,
          details: {
            status: response.status,
          },
        });
      }

      return okV1({
        source: "xueqiu",
        symbol,
        payload: parseJsonBestEffortV1(text),
      });
    } catch (error) {
      return failV1("INTERNAL_ERROR", "xueqiu quotec fetch failed", {
        status: getProviderErrorStatusV0(error),
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
