import { NextResponse } from "next/server";

// Demo request for `POST /api/daa/rebalance/core`.
// Kept server-side so step pages don't embed big sample blobs in client bundles.
export async function GET() {
  return NextResponse.json(
    {
      account: {
        baseCcy: "USD",
        cash: 0,
      },
      constraints: {
        maxPositionPct: 0.6,
        maxIn: 500,
        maxOut: 500,
        minNotional: 0.01,
      },
      // v0 trigger policy: avoid over-trading on tiny drifts and add a debounce window.
      policy: {
        thresholdPct: 0.01,
        minTradeNotional: 10,
        cooldownSeconds: 10 * 60,
      },
      holdings: [
        { symbol: "SPY", qty: 10 },
        { symbol: "TLT", qty: 10 },
      ],
      prices: [
        { symbol: "SPY", price: 100 },
        { symbol: "TLT", price: 100 },
        { symbol: "GLD", price: 100 },
      ],
      targetWeights: [
        { id: "SPY", label: "SPY", targetPct: 0.5 },
        { id: "TLT", label: "TLT", targetPct: 0.25 },
        { id: "GLD", label: "GLD", targetPct: 0.25 },
      ],
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
