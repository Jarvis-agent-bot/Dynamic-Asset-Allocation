import { failV1, okV1 } from "@/src/daa/api/routeHelpersV1";

import { clampLimitV0, fetchTextWithTimeoutV0, getProviderErrorStatusV0, mustGetEnvV0 } from "../../_lib/providerAdaptersV0";

function parseJsonBestEffortV1(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const restId = url.searchParams.get("restId")?.trim();
    const includeReplies = (url.searchParams.get("includeReplies") ?? "").trim() === "1";
    const cursor = url.searchParams.get("cursor")?.trim() || "";
    const limit = clampLimitV0(url.searchParams.get("limit"));

    if (!restId) {
      return failV1("VALIDATION_FAILED", "missing restId", { status: 400 });
    }

    const token = mustGetEnvV0("TWITTERDATA_TOKEN");
    const endpoint = includeReplies ? "UserTweetsAndReplies" : "UserTweets";
    const upstream = new URL(`https://pro.twitterdata.com/${endpoint}`);
    upstream.searchParams.set("restId", restId);
    upstream.searchParams.set("token", token);
    if (cursor) upstream.searchParams.set("cursor", cursor);
    upstream.searchParams.set("limit", String(limit));

    const response = await fetchTextWithTimeoutV0(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    const text = await response.text();
    if (!response.ok) {
      return failV1("INTERNAL_ERROR", "twitterdata upstream error", {
        status: 502,
        details: {
          status: response.status,
        },
      });
    }

    return okV1({
      source: "twitterdata",
      restId,
      includeReplies,
      cursor: cursor || null,
      payload: parseJsonBestEffortV1(text),
    });
  } catch (error) {
    return failV1("INTERNAL_ERROR", "twitter user tweets fetch failed", {
      status: getProviderErrorStatusV0(error),
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
