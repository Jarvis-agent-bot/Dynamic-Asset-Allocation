import { describe, expect, it } from "vitest";

import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";
import {
  MARKET_INDICATOR_CONFIG_KEYS_,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalog";

describe("system-config-normalization", () => {
  it("市场状态层会保留 catalog 中的全部指标配置", () => {
    const normalized = normalizeSystemConfig({});

    expect(Object.keys(normalized.dataSources.marketIndicators.indicators).sort()).toEqual(
      [...MARKET_INDICATOR_CONFIG_KEYS_].sort(),
    );
    expect(normalized.dataSources.marketIndicators.indicators.marketBreadth).toEqual({
      enabled: true,
      weight: 0.45,
    });
  });

  it("会丢弃 Settings 中已经没有运行时消费路径的数据源旧字段", () => {
    const normalized = normalizeSystemConfig({
      dataSources: {
        hfFund: { id: "hf_fund.legacy" },
        priceFeed: {
          id: "price_feed.legacy",
          provider: "custom_price",
          intervalMinutes: 1,
        },
        newsFeed: {
          id: "news_feed.legacy",
          provider: "custom_news",
          valuationEnabled: false,
        },
        fxFeed: {
          id: "fx_feed.legacy",
          provider: "manual",
        },
        marketIndicators: {
          id: "market_indicators.legacy",
        },
      },
    });

    expect("id" in (normalized.dataSources.hfFund as unknown as Record<string, unknown>)).toBe(false);
    expect("id" in (normalized.dataSources.priceFeed as unknown as Record<string, unknown>)).toBe(false);
    expect("provider" in (normalized.dataSources.priceFeed as unknown as Record<string, unknown>)).toBe(false);
    expect("intervalMinutes" in (normalized.dataSources.priceFeed as unknown as Record<string, unknown>)).toBe(false);
    expect("id" in (normalized.dataSources.newsFeed as unknown as Record<string, unknown>)).toBe(false);
    expect("provider" in (normalized.dataSources.newsFeed as unknown as Record<string, unknown>)).toBe(false);
    expect("valuationEnabled" in (normalized.dataSources.newsFeed as unknown as Record<string, unknown>)).toBe(false);
    expect("id" in (normalized.dataSources.fxFeed as unknown as Record<string, unknown>)).toBe(false);
    expect("provider" in (normalized.dataSources.fxFeed as unknown as Record<string, unknown>)).toBe(false);
    expect("id" in (normalized.dataSources.marketIndicators as unknown as Record<string, unknown>)).toBe(false);
  });
});
