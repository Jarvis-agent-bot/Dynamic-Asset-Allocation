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

  it("同业横截面样本达到门槛后才计算 PE/PB 分位", () => {
    const requested = {
      "1810.HK": snapshot({ symbol: "1810.HK", pe: 18, pb: 2.7 }),
    };
    const peers = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => {
        const symbol = `PEER${index + 1}`;
        return [symbol, snapshot({ symbol, pe: 30 + index, pb: 5 + index })];
      }),
    );

    const enriched = enrichYfinanceFundamentalSnapshotsWithPeers(requested, peers)["1810.HK"]!;

    expect(enriched.peerGroupBasis).toBe("industry");
    expect(enriched.peerGroupLabel).toBe("行业：Consumer Electronics");
    expect(enriched.pePeerSampleCount).toBe(21);
    expect(enriched.pePeerPercentile).toBe(4.76);
    expect(enriched.pePeerMedian).toBe(39);
    expect(enriched.pbPeerSampleCount).toBe(21);
    expect(enriched.pbPeerPercentile).toBe(4.76);
    expect(enriched.peerReason).toBe(null);
  });

  it("同业样本不足时只保留样本说明，不给百分位", () => {
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
    expect(enriched.pePeerSampleCount).toBe(5);
    expect(enriched.pePeerPercentile).toBe(null);
    expect(enriched.peerMinSampleCount).toBe(20);
    expect(enriched.peerReason).toBe("insufficient_peer_sample_count:5/20");
  });
});
