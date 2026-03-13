import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";

import { clampLimit, fetchTextWithTimeout, getProviderErrorStatus, mustGetEnv } from "../../_lib/providerAdapters";

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
      const restId = url.searchParams.get("restId")?.trim();
      const includeReplies = (url.searchParams.get("includeReplies") ?? "").trim() === "1";
      const cursor = url.searchParams.get("cursor")?.trim() || "";
      const limit = clampLimit(url.searchParams.get("limit"));

      if (!restId) {
        return fail("VALIDATION_FAILED", "missing restId", { status: 400 });
      }

      const token = mustGetEnv("TWITTERDATA_TOKEN");
      const endpoint = includeReplies ? "UserTweetsAndReplies" : "UserTweets";
      const upstream = new URL(`https://pro.twitterdata.com/${endpoint}`);
      upstream.searchParams.set("restId", restId);
      upstream.searchParams.set("token", token);
      if (cursor) upstream.searchParams.set("cursor", cursor);
      upstream.searchParams.set("limit", String(limit));

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
        restId,
        includeReplies,
        cursor: cursor || null,
        payload: parseJsonBestEffort(text),
      });
    } catch (error) {
      return fail("INTERNAL_ERROR", "twitter user tweets fetch failed", {
        status: getProviderErrorStatus(error),
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
