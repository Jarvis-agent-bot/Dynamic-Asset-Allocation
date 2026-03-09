import { failV1, okV1 } from "@/src/daa/api/routeHelpersV1";

import { fetchTextWithTimeoutV0, getProviderErrorStatusV0 } from "../../../_lib/providerAdaptersV0";

function normalizeReportDate(raw: string | null): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const compact = text.replace(/[^0-9]/g, "");
  if (compact.length !== 8) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

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
    const fundCode = String(url.searchParams.get("fund_code") || "").trim();
    const reportDate = normalizeReportDate(url.searchParams.get("report_date"));

    if (!fundCode) {
      return failV1("VALIDATION_FAILED", "missing fund_code", { status: 400 });
    }
    if (!reportDate) {
      return failV1("VALIDATION_FAILED", "invalid report_date", { status: 400 });
    }

    const upstream = new URL("https://danjuanfunds.com/djapi/fundx/base/fund/record/asset/percent");
    upstream.searchParams.set("fund_code", fundCode);
    upstream.searchParams.set("report_date", reportDate);

    const response = await fetchTextWithTimeoutV0(upstream, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        referer: `https://danjuanfunds.com/rn/fund-detail/archive?id=103&code=${encodeURIComponent(fundCode)}`,
        origin: "https://danjuanfunds.com",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });

    const text = await response.text();
    const payload = parseJsonBestEffortV1(text);

    if (!response.ok) {
      return failV1("INTERNAL_ERROR", "danjuan upstream error", {
        status: 502,
        details: {
          status: response.status,
          payload,
        },
      });
    }

    return okV1({
      source: "danjuan",
      fundCode,
      reportDate,
      payload,
    });
  } catch (error) {
    return failV1("INTERNAL_ERROR", "danjuan fund asset-percent fetch failed", {
      status: getProviderErrorStatusV0(error),
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
