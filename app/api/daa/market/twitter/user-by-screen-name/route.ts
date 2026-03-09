import { failV1, okV1 } from "@/src/daa/api/routeHelpersV1";

import { fetchTextWithTimeoutV0, getProviderErrorStatusV0, mustGetEnvV0 } from "../../_lib/providerAdaptersV0";

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
    const screenName = url.searchParams.get("screenName")?.trim();

    if (!screenName) {
      return failV1("VALIDATION_FAILED", "missing screenName", { status: 400 });
    }

    const token = mustGetEnvV0("TWITTERDATA_TOKEN");
    const upstream = new URL("https://pro.twitterdata.com/UserByScreenName");
    upstream.searchParams.set("screenName", screenName);
    upstream.searchParams.set("token", token);

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
      screenName,
      payload: parseJsonBestEffortV1(text),
    });
  } catch (error) {
    return failV1("INTERNAL_ERROR", "twitter user resolve failed", {
      status: getProviderErrorStatusV0(error),
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
