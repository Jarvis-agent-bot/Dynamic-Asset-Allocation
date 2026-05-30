import { describe, it, expect } from "vitest";

import {
  backtestSingleNameBreakout,
  computeBreakoutStats,
  type OhlcvBar,
  type BreakoutTrade,
} from "../backtestSingleNameBreakout";

/** 生成一段可控的 OHLCV 序列。 */
function makeBars(
  closes: number[],
  volumes: number[],
  startDate = "2025-01-01",
): OhlcvBar[] {
  const base = new Date(startDate + "T00:00:00Z").getTime();
  return closes.map((c, i) => {
    const prev = i > 0 ? closes[i - 1] : c;
    return {
      date: new Date(base + i * 86400000).toISOString().slice(0, 10),
      open: prev, // 次日开盘≈前收，便于断言进场价
      high: Math.max(c, prev) * 1.005,
      low: Math.min(c, prev) * 0.995,
      close: c,
      volume: volumes[i],
    };
  });
}

describe("backtestSingleNameBreakout", () => {
  it("数据不足时返回 warning 且无成交", () => {
    const bars = makeBars([100, 101, 102], [1, 1, 1]);
    const res = backtestSingleNameBreakout("TEST", bars);
    expect(res.trades).toHaveLength(0);
    expect(res.stats).toBeNull();
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("缓慢上升后放量突破 → 至少触发一笔，且 R 在 [-1, reward] 范围内", () => {
    // 60 根缓慢上升（趋势 + 慢线上升），第 60 根放量突破新高
    const closes: number[] = [];
    const vols: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      closes.push(100 + i * 0.5); // 稳定上升
      vols.push(1_000_000);
    }
    // 制造一根明显突破 + 放量
    closes.push(closes[closes.length - 1] * 1.05);
    vols.push(3_000_000); // 3x 放量
    // 之后继续给数据让它有机会到目标或止损
    for (let i = 0; i < 30; i += 1) {
      closes.push(closes[closes.length - 1] * 1.01);
      vols.push(1_200_000);
    }
    const bars = makeBars(closes, vols);
    const res = backtestSingleNameBreakout("UP", bars, { useMaExit: false });
    expect(res.trades.length).toBeGreaterThanOrEqual(1);
    for (const t of res.trades) {
      expect(t.r).toBeGreaterThanOrEqual(-1.001);
      expect(t.r).toBeLessThanOrEqual(2.001); // rewardMultiple 默认 2
      expect(t.entry).toBeGreaterThan(0);
      expect(t.stop).toBeLessThan(t.entry);
      expect(t.target).toBeGreaterThan(t.entry);
    }
  });

  it("止损单的 R 约为 -1", () => {
    const closes: number[] = [];
    const vols: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      closes.push(100 + i * 0.5);
      vols.push(1_000_000);
    }
    closes.push(closes[closes.length - 1] * 1.05); // 突破
    vols.push(3_000_000);
    // 突破后立刻暴跌击穿止损
    for (let i = 0; i < 10; i += 1) {
      closes.push(closes[closes.length - 1] * 0.95);
      vols.push(1_000_000);
    }
    const bars = makeBars(closes, vols);
    const res = backtestSingleNameBreakout("DOWN", bars, { useMaExit: false });
    const stops = res.trades.filter((t) => t.reason === "STOP" || t.reason === "STOP_GAP" || t.reason === "STOP_BOTH");
    expect(stops.length).toBeGreaterThanOrEqual(1);
    for (const t of stops) {
      expect(t.r).toBeLessThanOrEqual(-0.9);
    }
  });

  it("不追高过滤：乖离过大时不入场", () => {
    // 抛物线急涨，远离慢线 → maxExtensionPct 过滤掉
    const closes: number[] = [];
    const vols: number[] = [];
    for (let i = 0; i < 80; i += 1) {
      closes.push(100 * Math.pow(1.04, i)); // 每天 +4%，严重乖离
      vols.push(2_000_000);
    }
    const bars = makeBars(closes, vols);
    const res = backtestSingleNameBreakout("PARABOLIC", bars, { maxExtensionPct: 0.2 });
    // 急涨乖离远大于 20%，应被过滤，成交应很少甚至为 0
    expect(res.trades.length).toBeLessThanOrEqual(1);
  });

  it("computeBreakoutStats 计算正确（手工对账）", () => {
    const trades: BreakoutTrade[] = [
      mkTrade(2), // 赢 +2R
      mkTrade(-1), // 亏 -1R
      mkTrade(2), // 赢 +2R
      mkTrade(-1), // 亏 -1R
    ];
    const s = computeBreakoutStats(trades)!;
    expect(s.trades).toBe(4);
    expect(s.winRate).toBe(50);
    expect(s.avgWinR).toBe(2);
    expect(s.avgLossR).toBe(-1);
    expect(s.payoff).toBe(2);
    expect(s.expectancy).toBe(0.5);
    expect(s.profitFactor).toBe(2); // 4 / 2
    expect(s.totalR).toBe(2);
    expect(s.maxConsecutiveLosses).toBe(1);
  });
});

function mkTrade(r: number): BreakoutTrade {
  return {
    symbol: "X",
    entryDate: "2025-01-01",
    exitDate: "2025-01-05",
    entry: 100,
    stop: 92,
    target: 116,
    exit: r > 0 ? 116 : 92,
    r,
    reason: r > 0 ? "TARGET" : "STOP",
    bars: 4,
  };
}
