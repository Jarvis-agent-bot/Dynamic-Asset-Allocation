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
    expect(normalized.dataSources.marketIndicators.indicators.ppiInflation).toEqual({
      enabled: true,
      weight: 0.4,
    });
  });

  it("会丢弃 Settings 中已经没有运行时消费路径的数据源冗余字段", () => {
    const normalized = normalizeSystemConfig({
      dataSources: {
        hfFund: { id: "hf_fund.extra" },
        priceFeed: {
          id: "price_feed.extra",
          provider: "custom_price",
          intervalMinutes: 1,
        },
        newsFeed: {
          id: "news_feed.extra",
          provider: "custom_news",
          valuationEnabled: false,
        },
        fxFeed: {
          id: "fx_feed.extra",
          provider: "manual",
        },
        marketIndicators: {
          id: "market_indicators.extra",
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

  it("会归一化策略风格和放量突破参数", () => {
    const normalized = normalizeSystemConfig({
      strategy: {
        style: "breakout_growth",
        breakout: {
          enabled: true,
          breakoutLookback: 3,
          volMultiple: 9,
          maFast: 4,
          maSlow: 999,
          maxExtensionPct: 2,
          balancedBoostMultiplier: 3,
          balancedWeakMultiplier: 0.01,
        },
      },
    });

    expect(normalized.strategy.style).toBe("breakout_growth");
    expect(normalized.strategy.breakout.breakoutLookback).toBe(5);
    expect(normalized.strategy.breakout.volMultiple).toBe(5);
    expect(normalized.strategy.breakout.maFast).toBe(5);
    expect(normalized.strategy.breakout.maSlow).toBe(260);
    expect(normalized.strategy.breakout.maxExtensionPct).toBe(1);
    expect(normalized.strategy.breakout.balancedBoostMultiplier).toBe(2);
    expect(normalized.strategy.breakout.balancedWeakMultiplier).toBe(0.1);
  });
});
