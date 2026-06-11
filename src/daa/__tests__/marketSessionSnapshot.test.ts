import { describe, expect, it } from "vitest";

import {
  summarizeMarketSessionsForAssetKeys,
} from "@/src/daa/marketSession/marketSessionSnapshot";

describe("market-session-snapshot", () => {
  it("按关注资产去重生成 Agent 可读的市场开闭市摘要", () => {
    const rows = summarizeMarketSessionsForAssetKeys({
      assetKeys: ["US::AAPL", "HK::0388", "US::MSFT", "INVALID"],
      now: new Date("2026-06-08T14:00:00.000Z"),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        market: "US",
        isOpen: true,
        reasonCode: "OPEN",
        localTime: "10:00",
      }),
      expect.objectContaining({
        market: "HK",
        isOpen: false,
        reasonCode: "AFTER_CLOSE",
        localTime: "22:00",
      }),
    ]);
  });
});
