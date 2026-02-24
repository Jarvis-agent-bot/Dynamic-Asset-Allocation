import { NextResponse } from "next/server";

import { requireDaaFixtureSmokeGateV0 } from "@/src/daa/fixtureSmokeGateV0";

// Demo payloads for Step2 ingestion.
// Kept server-side so we don't ship large sample blobs in the client bundle.
export async function GET(req: Request) {
  const denied = await requireDaaFixtureSmokeGateV0(req, "fixture");
  if (denied) return denied;

  return NextResponse.json(
    {
      twitter: [
        {
          id: "1870000000000000000",
          created_at: "2026-02-10T08:30:00.000Z",
          text: "Macro: CPI print looks softer than expected. $SPY $QQQ\nAnalyst view: risk-on may persist.",
          author: "@analyst_list",
          url: "https://twitter.com/",
          tags: ["macro", "rates"],
        },
      ],
      yfinance: [
        {
          uuid: "yf-1",
          title: "Company earnings beat estimates",
          link: "https://finance.yahoo.com/",
          providerPublishTime: 1765414200,
          relatedTickers: ["AAPL"],
          summary: "Objective news example from yfinance export.",
        },
      ],
      xueqiu: {
        items: [
          {
            id: "xq-1",
            created_at: 1765417800,
            title: "雪球：市场快讯",
            summary: "示例：可粘贴雪球 API/抓取导出的 JSON。",
            symbols: ["SH600519"],
            url: "https://xueqiu.com/",
          },
        ],
      },
    },
    {
      headers: {
        // Fixtures are safe to cache, but keep dev iteration predictable.
        "cache-control": "no-store",
      },
    },
  );
}
