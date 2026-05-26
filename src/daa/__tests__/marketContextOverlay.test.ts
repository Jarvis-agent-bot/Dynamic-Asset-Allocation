import { describe, expect, it } from "vitest";

import { DEFAULT_SYSTEM_CONFIG_ } from "@/src/daa/config/systemConfig";
import { resolveMarketScopeForAsset } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import {
  buildMarketContextFromIndicators,
  deriveMarketRegime,
  mergeMarketRegimeConservatively,
} from "@/src/daa/modules/marketContext/marketContextOverlay";
import type { DaaMarketIndicatorKey, DaaMarketIndicatorSnapshot } from "@/src/daa/modules/marketContext/marketContextTypes";

function defaultScopeForKey(key: DaaMarketIndicatorKey): DaaMarketIndicatorSnapshot["scope"] {
  if (key === "vix" || key === "qqq_spy_ratio") return "us_equity";
  if (key === "fxi_volatility" || key === "kweb_fxi_ratio") return "hk_cn_equity";
  if (key === "btc_eth_ratio" || key === "btc_volatility") return "crypto";
  if (key === "ppi_inflation" || key === "fed_policy_rate" || key === "fed_balance_sheet") return "macro_policy";
  if (key === "usd_strength" || key === "inflation_expectation") return "macro_global";
  return "macro_defensive";
}

function defaultCategoryForKey(key: DaaMarketIndicatorKey): DaaMarketIndicatorSnapshot["category"] {
  if (key === "qqq_spy_ratio" || key === "kweb_fxi_ratio" || key === "btc_eth_ratio" || key === "gold_silver_ratio") {
    return "relative_value";
  }
  if (
    key === "yield_curve_spread"
    || key === "usd_strength"
    || key === "credit_spread"
    || key === "inflation_expectation"
    || key === "market_breadth"
    || key === "ppi_inflation"
    || key === "fed_policy_rate"
    || key === "fed_balance_sheet"
  ) {
    return "macro";
  }
  return "volatility";
}

function defaultUnitForKey(key: DaaMarketIndicatorKey): string | undefined {
  if (key === "vix") return "%";
  if (key === "fxi_volatility" || key === "btc_volatility") return "%";
  if (key === "qqq_spy_ratio" || key === "kweb_fxi_ratio" || key === "btc_eth_ratio" || key === "gold_silver_ratio") return "x";
  if (key === "ppi_inflation" || key === "fed_policy_rate") return "%";
  if (key === "fed_balance_sheet") return "$T";
  return undefined;
}

function makeIndicator(
  key: DaaMarketIndicatorKey,
  overrides: Partial<DaaMarketIndicatorSnapshot> = {},
): DaaMarketIndicatorSnapshot {
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
    const config = structuredClone(DEFAULT_SYSTEM_CONFIG_.dataSources.marketIndicators);
    config.indicators.vix = { enabled: true, weight: 2 };
    config.indicators.qqqSpyRatio = { enabled: true, weight: 1 };
    config.indicators.btcEthRatio.enabled = false;
    config.indicators.btcVolatility.enabled = false;
    config.indicators.fxiVolatility.enabled = false;
    config.indicators.kwebFxiRatio.enabled = false;
    config.indicators.goldSilverRatio.enabled = false;

    const context = buildMarketContextFromIndicators({
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
    expect(resolveMarketScopeForAsset({ symbol: "600519.SS", market: "CN" })).toBe("hk_cn_equity");
    expect(resolveMarketScopeForAsset({ symbol: "0700.HK", market: "HK" })).toBe("hk_cn_equity");
    expect(resolveMarketScopeForAsset({ symbol: "BTC-USD", market: "CRYPTO" })).toBe("crypto");
  });

  it("会把 PPI、政策利率和缩表汇总成独立宏观政策上下文，但不覆盖可交易市场主环境", () => {
    const config = structuredClone(DEFAULT_SYSTEM_CONFIG_.dataSources.marketIndicators);
    for (const key of Object.keys(config.indicators) as Array<keyof typeof config.indicators>) {
      config.indicators[key].enabled = false;
    }
    config.indicators.vix = { enabled: true, weight: 1 };
    config.indicators.ppiInflation = { enabled: true, weight: 1 };
    config.indicators.fedPolicyRate = { enabled: true, weight: 1 };
    config.indicators.fedBalanceSheet = { enabled: true, weight: 1 };

    const context = buildMarketContextFromIndicators({
      config,
      indicators: [
        makeIndicator("vix", {
          scope: "us_equity",
          stance: "risk_on",
          riskOffScorePct: 20,
          confidencePct: 90,
          reason: "VIX 低位",
        }),
        makeIndicator("ppi_inflation", {
          stance: "risk_off",
          riskOffScorePct: 80,
          confidencePct: 85,
          reason: "PPI 偏高",
        }),
        makeIndicator("fed_policy_rate", {
          stance: "risk_off",
          riskOffScorePct: 75,
          confidencePct: 90,
          reason: "利率仍高",
        }),
        makeIndicator("fed_balance_sheet", {
          stance: "risk_off",
          riskOffScorePct: 70,
          confidencePct: 80,
          reason: "缩表持续",
        }),
      ],
    });

    expect(context?.regime).toBe("risk_on");
    expect(context?.macroPolicy?.regime).toBe("risk_off");
    expect(context?.macroPolicy?.dimensions.map((item) => item.key)).toEqual(["inflation", "rates", "liquidity"]);
    expect(context?.macroPolicy?.reasons.join(" / ")).toContain("PPI 偏高");
    expect(context?.assetBudgets?.find((item) => item.key === "us_equity")?.stance).toBe("reduce");
    expect(context?.assetBudgets?.find((item) => item.key === "duration_bonds")?.stance).toBe("reduce");
    expect(context?.assetBudgets?.find((item) => item.key === "short_bonds_cash")?.stance).toBe("increase");
    expect(context?.scopes.map((item) => item.scope)).toEqual(["us_equity", "macro_policy"]);
  });

  it("会按阈值判断环境并以更保守的一侧为准", () => {
    expect(deriveMarketRegime(39.9)).toBe("risk_on");
    expect(deriveMarketRegime(40)).toBe("transitional");
    expect(deriveMarketRegime(65)).toBe("risk_off");

    expect(mergeMarketRegimeConservatively("transitional", "risk_off")).toBe("risk_off");
    expect(mergeMarketRegimeConservatively("risk_on", "transitional")).toBe("transitional");
    expect(mergeMarketRegimeConservatively(null, "risk_on")).toBe("risk_on");
  });
});
