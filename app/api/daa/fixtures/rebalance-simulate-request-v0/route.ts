import { NextResponse } from "next/server";

// Demo request for `POST /api/daa/rebalance/simulate`.
// Kept server-side so step pages don't embed big sample blobs in client bundles.
export async function GET() {
  return NextResponse.json(
    {
      money_plan: {
        account: {
          baseCcy: "USD",
          totalEquity: 10000,
          cash: 2500,
          investable: 8000,
        },
        constraints: {
          maxPositionPct: 0.2,
          maxIn: 1200,
          maxOut: 1200,
        },
        allocations: [
          { id: "SPY", label: "US Equity (SPY)", targetPct: 0.6, tags: { riskPreference: "mid" } },
          { id: "TLT", label: "US Bonds (TLT)", targetPct: 0.4, tags: { riskPreference: "low" } },
        ],
      },
      signals: [
        { symbol: "SPY", action: "BUY", score: 0.82, reason: "trend up" },
        { symbol: "TLT", action: "HOLD", score: 0.55, reason: "neutral" },
      ],
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
