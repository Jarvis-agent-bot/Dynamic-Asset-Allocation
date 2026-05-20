import { describe, expect, it } from "vitest";

import { summarizeStrategyLabWarnings } from "../strategyLabWarningPresentation";

describe("summarizeStrategyLabWarnings", () => {
  it("将跨市场估值与最小下单额提示聚合为产品文案", () => {
    const summary = summarizeStrategyLabWarnings([
      "跨市场估值日历已改为交易日并集；资产非交易日用上一根收盘价前向填充 445 个估值点，下单仍限制在各资产真实交易日",
      "warning: insufficient cash for minOrderNotional=50.00; cashAvail=0.00. Consider lowering minOrderNotional or selling overweight assets first.",
      "warning: min order size: SELL US::QQQ rounded 53.69 -> 50.00; skipped 3.69 (<minOrderNotional=50.00)",
      "warning: min order size: SELL US::QQQ rounded 72.71 -> 50.00; skipped 22.71 (<minOrderNotional=50.00)",
      "warning: min order size: SELL CRYPTO::BTC-USD rounded 138.62 -> 100.00; skipped 38.62 (<minOrderNotional=50.00)",
      "warning: min order size: BUY US::AMD rounded 75.26 -> 50.00; skipped 25.26 (<minOrderNotional=50.00)",
      "warning: min order size: BUY US::AAPL rounded 281.30 -> 250.00; skipped 31.30 (<minOrderNotional=50.00)",
      "warning: min order size: BUY US::SPY rounded 66.32 -> 50.00; skipped 16.32 (<minOrderNotional=50.00)",
      "warning: min order size: SELL US::NVDA rounded 256.85 -> 250.00; skipped 6.85 (<minOrderNotional=50.00)",
    ]);

    expect(summary.valuationNotes).toEqual([
      "跨市场资产按交易日并集估值，非交易日使用上一根收盘价前向填充（445 个估值点）；下单仍只在各资产真实交易日执行。",
    ]);
    expect(summary.orderNotes).toEqual([
      "有 7 笔调仓因最小下单额 50.00 按下单步长向下取整，少量尾差未执行。涉及 CRYPTO::BTC-USD、US::AAPL、US::AMD、US::NVDA 等 6 个资产。",
    ]);
    expect(summary.orderWarnings).toEqual([
      "部分买入因可用现金不足且未达到最小下单额被跳过，回测结果可能存在目标偏离；当前可用现金约 0.00。",
    ]);
    expect(summary.otherWarnings).toEqual([]);
  });

  it("保留无法分类的回测提示", () => {
    const summary = summarizeStrategyLabWarnings([
      "warning: targetPct for US::AAA out of range; clamped from 2 to 1",
      "资产 US::BBB 在 2026-01-01 缺少可前向填充的价格，已无法纳入统一估值日历",
    ]);

    expect(summary.otherWarnings).toEqual([
      "targetPct for US::AAA out of range; clamped from 2 to 1",
      "资产 US::BBB 在 2026-01-01 缺少可前向填充的价格，已无法纳入统一估值日历",
    ]);
  });
});
