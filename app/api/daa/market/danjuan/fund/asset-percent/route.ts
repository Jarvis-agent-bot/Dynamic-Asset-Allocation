import { NextResponse } from "next/server";

import { fetchTextWithTimeoutV0, getProviderErrorStatusV0 } from "../../../_lib/providerAdaptersV0";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function normalizeReportDate(raw: string | null): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const compact = text.replace(/[^0-9]/g, "");
  if (compact.length !== 8) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fundCode = String(url.searchParams.get("fund_code") || "").trim();
    const reportDate = normalizeReportDate(url.searchParams.get("report_date"));

    if (!fundCode) return json({ error: "missing fund_code" }, { status: 400 });
    if (!reportDate) return json({ error: "invalid report_date" }, { status: 400 });

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
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      return json({ error: "danjuan upstream error", status: response.status, payload }, { status: 502 });
    }

    return json({
      ok: true,
      source: "danjuan",
      fundCode,
      reportDate,
      payload,
    });
  } catch (e) {
    return json(
      {
        error: "danjuan fund asset-percent fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: getProviderErrorStatusV0(e) },
    );
  }
}
