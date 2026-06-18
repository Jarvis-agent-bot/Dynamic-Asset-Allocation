import { describe, expect, it } from "vitest";

import { collectRiskTriggerAssets, resolvePositionPnlPct } from "./positionPnl";

const baseRow = {
  assetKey: "CRYPTO::SOL-USD",
  symbol: "SOL-USD",
  holdingQty: 10,
  costBasisInBase: 1000,
  valuationBase: 792,
  unrealizedPnlPct: -20.8,
};

describe("positionPnl", () => {
  it("不会把未达到止损阈值的资产计入触发通知", () => {
    const hits = collectRiskTriggerAssets({
      rows: [baseRow],
      perAssetStopLossPct: 0.22,
      perAssetTakeProfitPct: 0.35,
    });

    expect(hits).toEqual([]);
  });

  it("按基准货币未实现盈亏判断止损和止盈触发", () => {
    const hits = collectRiskTriggerAssets({
      rows: [
        baseRow,
        {
          assetKey: "US::MU",
          symbol: "MU",
          holdingQty: 5,
          costBasisInBase: 1000,
          valuationBase: 1355,
          unrealizedPnlPct: null,
        },
      ],
      perAssetStopLossPct: 0.2,
      perAssetTakeProfitPct: 0.35,
    });

    expect(hits).toEqual([
      {
        assetKey: "CRYPTO::SOL-USD",
        symbol: "SOL-USD",
        pnlPct: -20.8,
        triggerType: "stop_loss",
      },
      {
        assetKey: "US::MU",
        symbol: "MU",
        pnlPct: 35.5,
        triggerType: "take_profit",
      },
    ]);
  });

  it("无法解析成本基准时返回 null，保留未知语义", () => {
    expect(resolvePositionPnlPct({
      assetKey: "US::AAPL",
      symbol: "AAPL",
      holdingQty: 1,
      costBasisInBase: null,
      valuationBase: 100,
      unrealizedPnlPct: null,
    })).toBeNull();
  });
});
