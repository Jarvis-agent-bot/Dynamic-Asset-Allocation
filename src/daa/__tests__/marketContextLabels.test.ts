import { describe, expect, it } from "vitest";

import {
  classifyMarketActionByRiskOffScore,
  isActionableMarketScope,
  marketActionByRiskOffScoreLabelZh,
  marketPressureLabelZh,
  marketRegimeActionLabelZh,
  marketScopeMeaningZh,
  marketScopeMetricLabelZh,
  marketScopePrimaryLabelZh,
} from "@/src/daa/modules/marketContext/marketContextLabels";
import { MARKET_INDICATOR_KEYS_ } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import { normalizeMarketIndicatorKey } from "@/src/daa/store/marketIndicatorNormalizers";

describe("market-context-labels", () => {
  it("把风险分映射成用户可理解的交易动作", () => {
    expect(classifyMarketActionByRiskOffScore(10)).toBe("strong_buy");
    expect(classifyMarketActionByRiskOffScore(35)).toBe("buy");
    expect(classifyMarketActionByRiskOffScore(54.6)).toBe("hold");
    expect(classifyMarketActionByRiskOffScore(70)).toBe("sell");
    expect(classifyMarketActionByRiskOffScore(95)).toBe("strong_sell");

    expect(marketActionByRiskOffScoreLabelZh(1.54)).toBe("强烈买入");
    expect(marketPressureLabelZh(99.49)).toBe("风险很高");
    expect(marketRegimeActionLabelZh("risk_off")).toBe("减仓/回避");
  });

  it("只把可交易市场区域显示为买卖动作", () => {
    expect(isActionableMarketScope("us_equity")).toBe(true);
    expect(isActionableMarketScope("hk_cn_equity")).toBe(true);
    expect(isActionableMarketScope("crypto")).toBe(true);
    expect(isActionableMarketScope("macro_defensive")).toBe(false);
    expect(isActionableMarketScope("macro_global")).toBe(false);
    expect(marketScopeMetricLabelZh("us_equity")).toBe("新增买入预算");
    expect(marketScopeMetricLabelZh("macro_defensive")).toBe("避险需求");
    expect(marketScopeMetricLabelZh("macro_global")).toBe("宏观风险");
    expect(marketScopePrimaryLabelZh({ scope: "macro_defensive", riskOffScorePct: 27 })).toBe("避险需求偏低");
    expect(marketScopePrimaryLabelZh({ scope: "macro_global", riskOffScorePct: 70 })).toBe("宏观风险偏高");
    expect(marketScopeMeaningZh("macro_defensive")).toContain("防御仓");
    expect(marketScopeMeaningZh("macro_global")).toContain("整体风险资产");
  });

  it("store 层支持 catalog 中的全部市场指标 key", () => {
    expect(MARKET_INDICATOR_KEYS_.map((key) => normalizeMarketIndicatorKey(key))).toEqual(MARKET_INDICATOR_KEYS_);
  });
});
