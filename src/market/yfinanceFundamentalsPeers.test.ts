import { describe, expect, it } from "vitest";

import { normalizeYfinanceFundamentalsPayload } from "./yfinanceFundamentals";
import {
  enrichYfinanceFundamentalSnapshotsWithPeers,
  getYfinanceFundamentalPeerCandidates,
} from "./yfinanceFundamentalsPeers";

function snapshot(input: {
  symbol: string;
  pe: number;
  pb: number;
  sector?: string;
  industry?: string;
}) {
  return normalizeYfinanceFundamentalsPayload({
    symbol: input.symbol,
    payload: null,
    quoteSummaryPayload: {
      quoteSummary: {
        result: [{
          price: {
            currency: "USD",
            regularMarketPrice: { raw: 10 },
            marketCap: { raw: 10_000_000_000 },
          },
          summaryDetail: {
            trailingPE: { raw: input.pe },
          },
          defaultKeyStatistics: {
            sharesOutstanding: { raw: 1_000_000_000 },
            priceToBook: { raw: input.pb },
          },
          assetProfile: {
            sector: input.sector ?? "Technology",
            sectorKey: "technology",
            industry: input.industry ?? "Consumer Electronics",
            industryKey: "consumer-electronics",
          },
        }],
      },
    },
    updatedAt: "2026-05-14T00:00:00.000Z",
  });
}

describe("yfinanceFundamentalsPeers", () => {
  it("为小米补充受控同业候选，避免只靠当前页面小样本", () => {
    const candidates = getYfinanceFundamentalPeerCandidates(["1810.HK"], { maxExtraSymbols: 12 });

    expect(candidates).toContain("AAPL");
    expect(candidates).toContain("005930.KS");
    expect(candidates).not.toContain("1810.HK");
  });

  it("按 Yahoo 行业字段计算同业横截面 PE/PB 分位", () => {
    const requested = {
      "1810.HK": snapshot({ symbol: "1810.HK", pe: 18, pb: 2.7 }),
    };
    const peers = {
      AAPL: snapshot({ symbol: "AAPL", pe: 30, pb: 40 }),
      "005930.KS": snapshot({ symbol: "005930.KS", pe: 12, pb: 1.1 }),
      SONY: snapshot({ symbol: "SONY", pe: 20, pb: 2.2 }),
      "0992.HK": snapshot({ symbol: "0992.HK", pe: 10, pb: 1.4 }),
    };

    const enriched = enrichYfinanceFundamentalSnapshotsWithPeers(requested, peers)["1810.HK"]!;

    expect(enriched.peerGroupBasis).toBe("industry");
    expect(enriched.peerGroupLabel).toBe("行业：Consumer Electronics");
    expect(enriched.pePeerSampleCount).toBe(5);
    expect(enriched.pePeerPercentile).toBe(60);
    expect(enriched.pePeerMedian).toBe(18);
    expect(enriched.pbPeerSampleCount).toBe(5);
    expect(enriched.pbPeerPercentile).toBe(80);
    expect(enriched.peerReason).toBe(null);
  });
});
