import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";

import { fetchTextWithTimeout, getProviderErrorStatus, mustGetEnv } from "../../_lib/providerAdapters";

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
      const screenName = url.searchParams.get("screenName")?.trim();

      if (!screenName) {
        return fail("VALIDATION_FAILED", "missing screenName", { status: 400 });
      }

      const token = mustGetEnv("TWITTERDATA_TOKEN");
      const upstream = new URL("https://pro.twitterdata.com/UserByScreenName");
      upstream.searchParams.set("screenName", screenName);
      upstream.searchParams.set("token", token);

      const response = await fetchTextWithTimeout(upstream, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      });

      const text = await response.text();
      if (!response.ok) {
        return fail("INTERNAL_ERROR", "twitterdata upstream error", {
          status: 502,
          details: {
            status: response.status,
          },
        });
      }

      return ok({
        source: "twitterdata",
        screenName,
        payload: parseJsonBestEffort(text),
      });
    } catch (error) {
      return fail("INTERNAL_ERROR", "twitter user resolve failed", {
        status: getProviderErrorStatus(error),
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
