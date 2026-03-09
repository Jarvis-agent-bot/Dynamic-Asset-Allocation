import { describe, expect, it } from "vitest";

import { DEFAULT_SYSTEM_CONFIG_V2 } from "@/src/daa/config/systemConfigV2";
import { resolveMarketScopeForAssetV1 } from "@/src/daa/modules/marketContext/marketIndicatorCatalogV1";
import {
  buildMarketContextFromIndicatorsV1,
  deriveMarketRegimeV1,
  mergeMarketRegimeConservativelyV1,
} from "@/src/daa/modules/marketContext/marketContextOverlayV1";
import type { DaaMarketIndicatorKeyV1, DaaMarketIndicatorSnapshotV1 } from "@/src/daa/modules/marketContext/marketContextTypesV1";

function defaultScopeForKey(key: DaaMarketIndicatorKeyV1): DaaMarketIndicatorSnapshotV1["scope"] {
  if (key === "vix" || key === "qqq_spy_ratio") return "us_equity";
  if (key === "fxi_volatility" || key === "kweb_fxi_ratio") return "hk_cn_equity";
  if (key === "btc_eth_ratio" || key === "btc_volatility") return "crypto";
  return "macro_defensive";
}

function defaultCategoryForKey(key: DaaMarketIndicatorKeyV1): DaaMarketIndicatorSnapshotV1["category"] {
  if (key === "qqq_spy_ratio" || key === "kweb_fxi_ratio" || key === "btc_eth_ratio" || key === "gold_silver_ratio") {
    return "relative_value";
  }
  return "volatility";
}

function defaultUnitForKey(key: DaaMarketIndicatorKeyV1): string | undefined {
  if (key === "vix") return "%";
  if (key === "fxi_volatility" || key === "btc_volatility") return "%";
  if (key === "qqq_spy_ratio" || key === "kweb_fxi_ratio" || key === "btc_eth_ratio" || key === "gold_silver_ratio") return "x";
  return undefined;
}

function makeIndicator(
  key: DaaMarketIndicatorKeyV1,
  overrides: Partial<DaaMarketIndicatorSnapshotV1> = {},
): DaaMarketIndicatorSnapshotV1 {
  return {
    key,
    label: key,
    category: defaultCategoryForKey(key),
    scope: defaultScopeForKey(key),
    stance: "neutral",
    riskOffScorePct: 50,
    confidencePct: 50,
    rawValue: 10,
    unit: defaultUnitForKey(key),
    percentile252: 50,
    zscore60: 0,
    trend1dPct: 0,
    trend7dPct: 0,
    trend30dPct: 0,
    reason: `${key}-reason`,
    source: "test",
    generatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("market-context-overlay-v1", () => {
  it("会按单一市场内的启用权重聚合状态，并输出对应 scope", () => {
    const config = structuredClone(DEFAULT_SYSTEM_CONFIG_V2.dataSources.marketIndicators);
    config.indicators.vix = { enabled: true, weight: 2 };
    config.indicators.qqqSpyRatio = { enabled: true, weight: 1 };
    config.indicators.btcEthRatio.enabled = false;
    config.indicators.btcVolatility.enabled = false;
    config.indicators.fxiVolatility.enabled = false;
    config.indicators.kwebFxiRatio.enabled = false;
    config.indicators.goldSilverRatio.enabled = false;

    const context = buildMarketContextFromIndicatorsV1({
      config,
      indicators: [
        makeIndicator("vix", {
          label: "VIX",
          stance: "risk_off",
          riskOffScorePct: 80,
          confidencePct: 90,
          reason: "VIX 处于高分位",
        }),
        makeIndicator("qqq_spy_ratio", {
          label: "QQQ/SPY",
          stance: "risk_on",
          riskOffScorePct: 20,
          confidencePct: 60,
          reason: "成长风格回暖",
        }),
      ],
    });

    expect(context).not.toBeNull();
    expect(context?.riskOffScorePct).toBeCloseTo(60, 6);
    expect(context?.confidencePct).toBeCloseTo(80, 6);
    expect(context?.regime).toBe("transitional");
    expect(context?.buyScale).toBeCloseTo(config.overlays.transitionalBuyScale, 6);
    expect(context?.highRiskBuyScale).toBeCloseTo(
      Math.min(0.85, config.overlays.highRiskBuyScale + 0.2),
      6,
    );
    expect(context?.reasons[0]).toBe("美股：VIX 处于高分位");
    expect(context?.indicators.map((item) => item.key)).toEqual(["vix", "qqq_spy_ratio"]);
    expect(context?.scopes).toHaveLength(1);
    expect(context?.scopes[0]?.scope).toBe("us_equity");
    expect(context?.scopes[0]?.riskOffScorePct).toBeCloseTo(60, 6);
  });

  it("会按市场代码与交易所后缀识别所属市场", () => {
    expect(resolveMarketScopeForAssetV1({ symbol: "600519.SS", market: "CN" })).toBe("hk_cn_equity");
    expect(resolveMarketScopeForAssetV1({ symbol: "0700.HK", market: "HK" })).toBe("hk_cn_equity");
    expect(resolveMarketScopeForAssetV1({ symbol: "BTC-USD", market: "CRYPTO" })).toBe("crypto");
  });

  it("会按阈值判断环境并以更保守的一侧为准", () => {
    expect(deriveMarketRegimeV1(39.9)).toBe("risk_on");
    expect(deriveMarketRegimeV1(40)).toBe("transitional");
    expect(deriveMarketRegimeV1(65)).toBe("risk_off");

    expect(mergeMarketRegimeConservativelyV1("transitional", "risk_off")).toBe("risk_off");
    expect(mergeMarketRegimeConservativelyV1("risk_on", "transitional")).toBe("transitional");
    expect(mergeMarketRegimeConservativelyV1(null, "risk_on")).toBe("risk_on");
  });
});
