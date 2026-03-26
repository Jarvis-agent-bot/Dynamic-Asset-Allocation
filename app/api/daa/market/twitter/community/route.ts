import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";

import { clampLimit, fetchTextWithTimeout, getProviderErrorStatus, mustGetEnv } from "../../_lib/providerAdapters";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

function parseJsonBestEffort(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
  logSwallowed("twitterCommunityRoute.parseJson", err);
    return { raw: text };
  }
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    try {
      const url = new URL(req.url);
      const communityId = url.searchParams.get("communityId")?.trim();
      const cursor = url.searchParams.get("cursor")?.trim() || "";
      const limit = clampLimit(url.searchParams.get("limit"));

      if (!communityId) {
        return fail("VALIDATION_FAILED", "missing communityId", { status: 400 });
      }

      const token = mustGetEnv("TWITTERDATA_TOKEN");
      const endpoint = (process.env.TWITTERDATA_COMMUNITY_ENDPOINT || "CommunityTweetsTimeline").trim();
      const upstream = new URL(`https://pro.twitterdata.com/${endpoint}`);

      upstream.searchParams.set("communityId", communityId);
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
        communityId,
        cursor: cursor || null,
        payload: parseJsonBestEffort(text),
      });
    } catch (error) {
      return fail("INTERNAL_ERROR", "twitter community fetch failed", {
        status: getProviderErrorStatus(error),
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
