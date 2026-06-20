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

  it("按统一仓位可行动性过滤低于最小成交额的风控触发", () => {
    const hits = collectRiskTriggerAssets({
      rows: [
        {
          assetKey: "HK::9988.HK",
          symbol: "9988.HK",
          holdingQty: 0.00000066,
          costBasisInBase: 1,
          valuationBase: 0.79,
          unrealizedPnlPct: -20.8,
        },
        {
          assetKey: "US::AMD",
          symbol: "AMD",
          holdingQty: 3,
          costBasisInBase: 300,
          valuationBase: 381,
          unrealizedPnlPct: 27,
        },
      ],
      perAssetStopLossPct: 0.2,
      perAssetTakeProfitPct: 0.25,
      materiality: {
        minNotionalBase: 200,
        minQtyEpsilon: 1e-8,
      },
    });

    expect(hits).toEqual([
      {
        assetKey: "US::AMD",
        symbol: "AMD",
        pnlPct: 27,
        triggerType: "take_profit",
      },
    ]);
  });

  it("按统一仓位可行动性过滤极小数量的风控触发", () => {
    const hits = collectRiskTriggerAssets({
      rows: [
        {
          assetKey: "US::MU",
          symbol: "MU",
          holdingQty: 0.0000000001,
          costBasisInBase: 1000,
          valuationBase: 1565,
          unrealizedPnlPct: 56.5,
        },
      ],
      perAssetStopLossPct: 0.2,
      perAssetTakeProfitPct: 0.25,
      materiality: {
        minNotionalBase: 200,
        minQtyEpsilon: 1e-8,
      },
    });

    expect(hits).toEqual([]);
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
