import { describe, expect, it } from "vitest";

import {
  classifyMarketActionByRiskOffScore,
  isActionableMarketScope,
  marketActionByRiskOffScoreLabelZh,
  marketIndicatorSignalLabelZh,
  marketPressureLabelZh,
  marketRegimeActionLabelZh,
  marketScopeMeaningZh,
  marketScopeMetricLabelZh,
  marketScopePrimaryLabelZh,
} from "@/src/daa/modules/marketContext/marketContextLabels";
import { MARKET_INDICATOR_KEYS, MARKET_INDICATOR_META_CATALOG } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import { normalizeMarketIndicatorKey } from "@/src/daa/store/marketIndicatorNormalizers";

describe("market-context-labels", () => {
  it("把风险分映射成用户可理解的交易动作", () => {
    expect(classifyMarketActionByRiskOffScore(10)).toBe("strong_buy");
    expect(classifyMarketActionByRiskOffScore(35)).toBe("buy");
    expect(classifyMarketActionByRiskOffScore(54.6)).toBe("hold");
    expect(classifyMarketActionByRiskOffScore(70)).toBe("sell");
    expect(classifyMarketActionByRiskOffScore(95)).toBe("strong_sell");

    expect(marketActionByRiskOffScoreLabelZh(1.54)).toBe("适合加仓");
    expect(marketIndicatorSignalLabelZh({ riskOffScorePct: 1.54 })).toBe("风险压力很低");
    expect(marketIndicatorSignalLabelZh({ riskOffScorePct: 99.49 })).toBe("风险压力很高");
    expect(marketPressureLabelZh(99.49)).toBe("风险很高");
    expect(marketRegimeActionLabelZh("risk_off")).toBe("环境偏谨慎");
  });

  it("只把可交易市场区域显示为买卖动作", () => {
    expect(isActionableMarketScope("us_equity")).toBe(true);
    expect(isActionableMarketScope("hk_cn_equity")).toBe(true);
    expect(isActionableMarketScope("crypto")).toBe(true);
    expect(isActionableMarketScope("macro_defensive")).toBe(false);
    expect(isActionableMarketScope("macro_global")).toBe(false);
    expect(marketScopeMetricLabelZh("us_equity")).toBe("加仓环境");
    expect(marketScopeMetricLabelZh("macro_defensive")).toBe("避险需求");
    expect(marketScopeMetricLabelZh("macro_global")).toBe("宏观压力");
    expect(marketScopeMetricLabelZh("macro_policy")).toBe("政策压力");
    expect(marketScopePrimaryLabelZh({ scope: "macro_defensive", riskOffScorePct: 27 })).toBe("避险需求偏低");
    expect(marketScopePrimaryLabelZh({ scope: "macro_global", riskOffScorePct: 70 })).toBe("宏观压力偏高");
    expect(marketScopePrimaryLabelZh({ scope: "macro_policy", riskOffScorePct: 70 })).toBe("政策压力偏高");
    expect(marketScopeMeaningZh("macro_defensive")).toContain("防御仓");
    expect(marketScopeMeaningZh("macro_global")).toContain("整体风险资产");
    expect(marketScopeMeaningZh("macro_policy")).toContain("缩表");
  });

  it("store 层支持 catalog 中的全部市场指标 key", () => {
    expect(MARKET_INDICATOR_KEYS.map((key) => normalizeMarketIndicatorKey(key))).toEqual(MARKET_INDICATOR_KEYS);
  });

  it("每个市场指标都有完整解释口径", () => {
    for (const key of MARKET_INDICATOR_KEYS) {
      const meaning = MARKET_INDICATOR_META_CATALOG[key].meaning;
      expect(meaning.measurement).toBeTruthy();
      expect(meaning.highSignal).toBeTruthy();
      expect(meaning.lowSignal).toBeTruthy();
      expect(meaning.neutralSignal).toBeTruthy();
      expect(meaning.usage).toBeTruthy();
    }
  });
});
