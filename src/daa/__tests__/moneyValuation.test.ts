import { describe, expect, it } from "vitest";

import {
  buildFxRateBook,
  convertLocalMoneyToBase,
  resolveFxRateToBaseCurrency,
} from "@/src/daa/modules/money/money";
import {
  buildFxLookupToBase,
  summarizeMarkToMarketPortfolio,
} from "@/src/daa/modules/portfolio/portfolioValuation";
import { buildAssetUniverseViewRows } from "@/src/daa/modules/workbench/assetUniverseService";

describe("money valuation boundary", () => {
  it("统一处理 direct/reverse FX 与 USDC/USD 等价规则", () => {
    const fxBook = buildFxRateBook([
      { baseCcy: "USD", quoteCcy: "HKD", rate: 7.8 },
      { baseCcy: "CNY", quoteCcy: "USD", rate: 0.14 },
    ]);

    expect(resolveFxRateToBaseCurrency("USD", "HKD", fxBook)).toBeCloseTo(1 / 7.8, 8);
    expect(resolveFxRateToBaseCurrency("USD", "CNY", fxBook)).toBeCloseTo(0.14, 8);
    expect(resolveFxRateToBaseCurrency("USD", "USDC", fxBook)).toBe(1);
  });

  it("组合估值只输出基准货币市值，并显式暴露缺失 FX", () => {
    const fxLookup = buildFxLookupToBase([
      { baseCcy: "USD", quoteCcy: "HKD", rate: 7.8 },
    ]);

    const summary = summarizeMarkToMarketPortfolio({
      baseCurrency: "USD",
      cash: 200,
      fxLookup,
      positions: [
        { symbol: "0388.HK", market: "HK", currency: "HKD", qty: 20, lastPrice: 390 },
        { symbol: "600519.SS", market: "CN", currency: "CNY", qty: 1, lastPrice: 1500 },
      ],
    });

    expect(summary.holdingsValue).toBeCloseTo(1000, 6);
    expect(summary.derivedTotalEquity).toBeCloseTo(1200, 6);
    expect(summary.totalEquity).toBeCloseTo(1200, 6);
    expect(summary.equitySource).toBe("derived_mark_to_market");
    expect(summary.fxMissingAssets).toHaveLength(1);
    expect(summary.fxMissingAssets[0]?.symbol).toBe("600519.SS");
  });

  it("总权益来源快照区分估值推导和账户覆盖", () => {
    const fxLookup = buildFxLookupToBase([
      { baseCcy: "USD", quoteCcy: "HKD", rate: 7.8 },
    ]);

    const summary = summarizeMarkToMarketPortfolio({
      baseCurrency: "USD",
      cash: 200,
      fxLookup,
      accountTotalEquity: 1300,
      positions: [
        { symbol: "0388.HK", market: "HK", currency: "HKD", qty: 20, lastPrice: 390 },
      ],
    });

    expect({
      holdingsValue: Number(summary.holdingsValue.toFixed(6)),
      cash: summary.cash,
      derivedTotalEquity: Number(summary.derivedTotalEquity.toFixed(6)),
      totalEquity: summary.totalEquity,
      equitySource: summary.equitySource,
      fxMissingAssetKeys: summary.fxMissingAssets.map((row) => row.assetKey),
    }).toMatchInlineSnapshot(`
      {
        "cash": 200,
        "derivedTotalEquity": 1200,
        "equitySource": "account_state_override",
        "fxMissingAssetKeys": [],
        "holdingsValue": 1000,
        "totalEquity": 1300,
      }
    `);
  });

  it("资产视图不再用成本本币乘当前 FX 作为 PnL 展示 fallback", () => {
    const rows = buildAssetUniverseViewRows({
      baseCurrency: "USD",
      cash: 0,
      fxRates: [{ id: "USD/HKD", baseCcy: "USD", quoteCcy: "HKD", rate: 7.8, source: "test", asOfTs: "2026-04-27T00:00:00.000Z", updatedAt: "2026-04-27T00:00:00.000Z" }],
      rows: [{
        assetKey: "HK::0388.HK",
        symbol: "0388.HK",
        market: "HK",
        currency: "HKD",
        assetClass: "EQUITY",
        region: "HK",
        exchange: "HKEX",
        instrumentType: "STOCK",
        marketGroup: "HK_EQUITY",
        holdingQty: 20,
        holdingPrice: 380,
        costBasis: 7600,
        costBasisInBase: null,
        holdingTags: [],
        watchEnabled: true,
        autoEntryEnabled: false,
        entryTargetWeightPct: null,
        entryCooldownDays: 14,
        lastEntryTriggeredAt: null,
        targetWeightHint: 0,
        watchTags: [],
        notes: null,
        priceAlertAbove: null,
        priceAlertBelow: null,
        lastPrice: 390,
        priceUpdatedAt: "2026-04-27T00:00:00.000Z",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:00:00.000Z",
      }],
    });

    expect(rows[0]?.valuationBase).toBeCloseTo(1000, 6);
    expect(rows[0]?.costBasisInBase).toBeNull();
    expect(rows[0]?.unrealizedPnlBase).toBeNull();
    expect(rows[0]?.unrealizedPnlPct).toBeNull();
  });

  it("现金流水换算入口在缺失 FX 时不会返回伪基准金额", () => {
    const conversion = convertLocalMoneyToBase({
      amount: 100,
      localCurrency: "HKD",
      baseCurrency: "USD",
      fxBook: buildFxRateBook([]),
    });

    expect(conversion.base).toBeNull();
    expect(conversion.fxRateToBase).toBeNull();
    expect(conversion.fxMissing).toBe(true);
  });
});
