/**
 * 端到端验证：用从远程 DAA 库（daa_market_candles_v1）导出的真实 5 年 candles，
 * 跑放量突破引擎，验证整条数据链路在真实数据上成立，并断言结果落在合理区间。
 *
 * fixture 来源：DISTINCT ON (symbol, ts::date) —— 与服务层 queryCandleHistory 同口径。
 * 若 fixture 缺失（未导出），测试自动跳过，不阻塞 CI。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  backtestSingleNameBreakout,
  computeBreakoutStats,
  type OhlcvBar,
  type BreakoutTrade,
} from "../backtestSingleNameBreakout";

const FIXTURE = join(__dirname, "fixtures", "breakout5y.json");
const hasFixture = existsSync(FIXTURE);

type RawBar = { date: string; open: number | string; high: number | string; low: number | string; close: number | string; volume: number | string | null };

function toBars(raw: RawBar[]): OhlcvBar[] {
  return raw.map((r) => ({
    date: r.date,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume ?? 0),
  }));
}

function simPortfolio(trades: BreakoutTrade[], initial = 100_000, riskPct = 0.01, maxSlots = 3) {
  const sorted = [...trades].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  let equity = initial, peak = initial, maxDd = 0, taken = 0;
  let open: string[] = [];
  for (const tr of sorted) {
    open = open.filter((d) => d > tr.entryDate);
    if (open.length >= maxSlots) continue;
    const rps = tr.entry - tr.stop;
    if (rps <= 0) continue;
    const shares = (equity * riskPct) / rps;
    equity += tr.r * shares * rps;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    open.push(tr.exitDate);
    taken++;
  }
  return { final: equity, retPct: (equity / initial - 1) * 100, maxDdPct: maxDd * 100, taken };
}

describe.skipIf(!hasFixture)("放量突破引擎 · 真实 5 年数据端到端", () => {
  const data: Record<string, RawBar[]> = hasFixture
    ? JSON.parse(readFileSync(FIXTURE, "utf8"))
    : {};
  const symbols = Object.keys(data).sort();

  it("fixture 含多只标的、每只约 5 年日线", () => {
    expect(symbols.length).toBeGreaterThanOrEqual(10);
    for (const sym of symbols) {
      expect(data[sym].length).toBeGreaterThan(1000); // 5y ≈ 1255 根
    }
  });

  it("引擎在真实数据上产生成交，且每笔 R 落在 [-1, reward] 合理区间", () => {
    const all: BreakoutTrade[] = [];
    for (const sym of symbols) {
      const res = backtestSingleNameBreakout(sym, toBars(data[sym]));
      all.push(...res.trades);
    }
    expect(all.length).toBeGreaterThan(20); // 5y×15只 应有可观成交
    for (const t of all) {
      // STOP_GAP 可略低于 -1（跳空跌破止损按开盘成交）；TARGET_GAP 可高于 reward（跳空高于目标按开盘成交）。
      // 因此只对"非跳空"成交断言严格区间，跳空成交只要求方向正确。
      if (t.reason === "STOP_GAP") {
        expect(t.r).toBeLessThanOrEqual(0);
      } else if (t.reason === "TARGET_GAP") {
        expect(t.r).toBeGreaterThanOrEqual(2); // 跳空到目标之上，R ≥ reward
      } else {
        expect(t.r).toBeGreaterThanOrEqual(-1.05);
        expect(t.r).toBeLessThanOrEqual(2.05); // 默认 rewardMultiple=2
      }
      expect(t.entryDate <= t.exitDate).toBe(true);
    }
    const stats = computeBreakoutStats(all)!;
    // 期望值/胜率/盈利因子应是有限数
    expect(Number.isFinite(stats.expectancy)).toBe(true);
    expect(stats.winRate).toBeGreaterThanOrEqual(0);
    expect(stats.winRate).toBeLessThanOrEqual(100);

    // 把真实统计打到 stdout，便于人工审阅
    const port = simPortfolio(all);
    // eslint-disable-next-line no-console
    console.log(
      `\n[E2E真实5y] 成交${stats.trades}笔 胜率${stats.winRate.toFixed(1)}% ` +
      `盈亏比${stats.payoff} 期望${stats.expectancy >= 0 ? "+" : ""}${stats.expectancy}R ` +
      `盈利因子${stats.profitFactor}\n` +
      `           组合$100k→$${port.final.toFixed(0)} (${port.retPct >= 0 ? "+" : ""}${port.retPct.toFixed(1)}%) ` +
      `回撤${port.maxDdPct.toFixed(1)}%\n` +
      `           出场: ${Object.entries(stats.exitReasonCounts).map(([k, v]) => `${k}:${v}`).join(" ")}`,
    );
  });

  it("出场实验：3 种出场模式横向对比（ma / trailing / target）", () => {
    function scenario(exitMode: "ma" | "trailing" | "target", trailingPct = 0.12) {
      const all: BreakoutTrade[] = [];
      for (const sym of symbols) {
        all.push(...backtestSingleNameBreakout(sym, toBars(data[sym]), { exitMode, trailingPct }).trades);
      }
      return { stats: computeBreakoutStats(all)!, port: simPortfolio(all) };
    }
    const ma = scenario("ma");
    const trail = scenario("trailing", 0.12);
    const target = scenario("target");
    const fmt = (label: string, s: typeof ma) =>
      `${label}: ${s.port.retPct >= 0 ? "+" : ""}${s.port.retPct.toFixed(1)}% ` +
      `期望${s.stats.expectancy}R 盈利因子${s.stats.profitFactor} 回撤${s.port.maxDdPct.toFixed(1)}% ${s.stats.trades}笔`;
    // eslint-disable-next-line no-console
    console.log(
      `\n[出场模式横评 · 真实5y]\n` +
      `  ${fmt("MA离场   ", ma)}\n` +
      `  ${fmt("跟踪12%  ", trail)}\n` +
      `  ${fmt("持有到目标", target)}\n` +
      `  → 收益最高: ${[["ma", ma], ["trailing", trail], ["target", target]].sort((a, b) => (b[1] as typeof ma).port.retPct - (a[1] as typeof ma).port.retPct)[0][0]}` +
      ` | 回撤最低: ${[["ma", ma], ["trailing", trail], ["target", target]].sort((a, b) => (a[1] as typeof ma).port.maxDdPct - (b[1] as typeof ma).port.maxDdPct)[0][0]}`,
    );
    expect(Number.isFinite(ma.port.retPct)).toBe(true);
    expect(Number.isFinite(trail.port.retPct)).toBe(true);
    expect(Number.isFinite(target.port.retPct)).toBe(true);
    // 跟踪止损应产生 TRAIL 出场
    const trailTrades: BreakoutTrade[] = [];
    for (const sym of symbols) trailTrades.push(...backtestSingleNameBreakout(sym, toBars(data[sym]), { exitMode: "trailing" }).trades);
    expect(trailTrades.some((t) => t.reason === "TRAIL")).toBe(true);
  });
});
