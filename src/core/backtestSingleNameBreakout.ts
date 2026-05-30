/**
 * 单标的「放量突破」择时回测引擎（纯函数，可单测）
 * ============================================================
 * 与 DAA 既有的 backtestDriftRebalance（组合再平衡/权重）是两套不同模型：
 *   - drift-rebalance: 多资产、按权重、定期再平衡（组合配置层）
 *   - 本引擎:          单标的、择时进出场、信号驱动（择时层）
 *
 * 入场规则（5 选 4，可配置阈值）：
 *   1. 收盘 > 过去 breakoutLookback 日最高收盘（突破）
 *   2. 当日量 ≥ 过去 breakoutLookback 日均量 × volMultiple（放量确认）
 *   3. MA(maFast) > MA(maSlow) 且 MA(maSlow) 上升（趋势过滤）
 *   4. 收盘距 MA(maSlow) 乖离 ≤ maxExtensionPct（不追高）
 *
 * 出场规则（可配置）：
 *   - 止损：入场 ×(1 − stopPct)
 *   - 止盈：入场 ×(1 + stopPct × rewardMultiple)
 *   - 跌破 MA(maFast) 收盘离场（useMaExit，可关闭以对比）
 *
 * 真实性约束（避免未来函数）：
 *   - 信号在第 i 根收盘后确认 → 第 i+1 根开盘进场（next-bar open）。
 *   - 同一根 K 线止损止盈都触及 → 保守假设先打止损（最坏情况）。
 *   - 跳空开盘穿越止损/止盈 → 按开盘价成交。
 *
 * 不构成投资建议；回测是历史统计，不代表未来。
 */

export type OhlcvBar = {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type BreakoutParams = {
  breakoutLookback: number; // 突破回看天数，默认 20
  volMultiple: number; // 放量倍数，默认 1.5
  maFast: number; // 快线，默认 20
  maSlow: number; // 慢线，默认 50
  maxExtensionPct: number; // 最大乖离（高出慢线），默认 0.20
  stopPct: number; // 止损百分比，默认 0.08
  rewardMultiple: number; // 盈亏比（目标 = stopPct × 此值），默认 2
  useMaExit: boolean; // 是否启用跌破快线离场，默认 true（仅 exitMode="ma" 时生效）
  /**
   * 出场模式：
   *   "ma"      跌破快线 MA 收盘离场（默认，最敏感，易被回踩震出）
   *   "trailing" 跟踪止损：从持仓最高价回撤 trailingPct 离场（让利润奔跑的折中）
   *   "target"  只靠固定止损/止盈，不提前离场（最"让利润奔跑"）
   * 兼容旧字段：未显式传 exitMode 时，useMaExit=false 等价 "target"，true 等价 "ma"。
   */
  exitMode?: "ma" | "trailing" | "target";
  trailingPct: number; // 跟踪止损回撤百分比（exitMode="trailing"），默认 0.12
};

export const DEFAULT_BREAKOUT_PARAMS: BreakoutParams = {
  breakoutLookback: 20,
  volMultiple: 1.5,
  maFast: 20,
  maSlow: 50,
  maxExtensionPct: 0.2,
  stopPct: 0.08,
  rewardMultiple: 2,
  useMaExit: true,
  exitMode: "ma",
  trailingPct: 0.12,
};

export type BreakoutExitReason =
  | "TARGET"
  | "TARGET_GAP"
  | "STOP"
  | "STOP_GAP"
  | "STOP_BOTH"
  | "MA_EXIT"
  | "TRAIL"
  | "EOD";

export type BreakoutTrade = {
  symbol: string;
  entryDate: string;
  exitDate: string;
  entry: number;
  stop: number;
  target: number;
  exit: number;
  r: number; // R 倍数 = (exit − entry) / (entry − stop)
  reason: BreakoutExitReason;
  bars: number; // 持仓 K 线数
};

export type BreakoutStats = {
  trades: number;
  winRate: number; // %
  avgWinR: number;
  avgLossR: number;
  payoff: number; // 盈亏比
  expectancy: number; // 期望值 R/笔
  profitFactor: number;
  maxConsecutiveLosses: number;
  avgHoldBars: number;
  bestR: number;
  worstR: number;
  totalR: number;
  exitReasonCounts: Record<string, number>;
};

export type BreakoutBacktestResult = {
  symbol: string;
  params: BreakoutParams;
  trades: BreakoutTrade[];
  stats: BreakoutStats | null;
  warnings: string[];
};

function sma(values: number[], end: number, n: number): number | null {
  // mean of values[end-n .. end-1]（不含 end，截至前一根）
  if (end < n) return null;
  let sum = 0;
  for (let i = end - n; i < end; i += 1) sum += values[i];
  return sum / n;
}

function maxOf(values: number[], start: number, end: number): number {
  let m = -Infinity;
  for (let i = start; i < end; i += 1) if (values[i] > m) m = values[i];
  return m;
}

function avgOf(values: number[], start: number, end: number): number {
  let s = 0;
  for (let i = start; i < end; i += 1) s += values[i];
  return s / Math.max(1, end - start);
}

/** 在单标的 OHLCV 序列上回放放量突破策略，返回逐笔成交。 */
export function backtestSingleNameBreakout(
  symbol: string,
  bars: OhlcvBar[],
  paramsInput: Partial<BreakoutParams> = {},
): BreakoutBacktestResult {
  const params: BreakoutParams = { ...DEFAULT_BREAKOUT_PARAMS, ...paramsInput };
  const warnings: string[] = [];

  const clean = (bars || [])
    .filter(
      (b) =>
        b &&
        typeof b.date === "string" &&
        [b.open, b.high, b.low, b.close, b.volume].every(
          (v) => Number.isFinite(v) && (v as number) >= 0,
        ) &&
        b.close > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const minNeeded = params.maSlow + 5;
  if (clean.length < minNeeded) {
    warnings.push(
      `${symbol} 数据不足（${clean.length} < ${minNeeded} 根），无法回测放量突破`,
    );
    return { symbol, params, trades: [], stats: null, warnings };
  }

  const close = clean.map((b) => b.close);
  const high = clean.map((b) => b.high);
  const low = clean.map((b) => b.low);
  const open = clean.map((b) => b.open);
  const vol = clean.map((b) => b.volume);
  const n = clean.length;

  const trades: BreakoutTrade[] = [];
  const { breakoutLookback: lb, volMultiple, maFast, maSlow, maxExtensionPct } =
    params;
  const { stopPct, rewardMultiple, useMaExit, trailingPct } = params;
  // 解析出场模式：显式 exitMode 优先；否则用旧字段 useMaExit 推导（true→ma, false→target）。
  const exitMode: "ma" | "trailing" | "target" =
    params.exitMode ?? (useMaExit ? "ma" : "target");

  let i = maSlow + 4; // 需要足够历史算慢线
  while (i < n - 1) {
    // 需要 i+1 进场
    const maFastVal = sma(close, i + 1, maFast);
    const maSlowVal = sma(close, i + 1, maSlow);
    const maSlowPrev = sma(close, i + 1 - 5, maSlow);
    if (maFastVal === null || maSlowVal === null || maSlowPrev === null) {
      i += 1;
      continue;
    }
    if (i < lb) {
      i += 1;
      continue;
    }
    const priorHigh = maxOf(close, i - lb, i); // 过去 lb 日最高收盘（不含今日）
    const volAvg = avgOf(vol, i - lb, i);
    const volRatio = volAvg > 0 ? vol[i] / volAvg : 0;
    const ext = (close[i] - maSlowVal) / maSlowVal;

    const triggered =
      close[i] > priorHigh &&
      volRatio >= volMultiple &&
      maFastVal > maSlowVal &&
      maSlowVal > maSlowPrev &&
      ext <= maxExtensionPct;

    if (!triggered) {
      i += 1;
      continue;
    }

    // 次日开盘进场
    const entryIdx = i + 1;
    const entry = open[entryIdx];
    const stop = entry * (1 - stopPct);
    const target = entry * (1 + stopPct * rewardMultiple);
    const rps = entry - stop;

    let exitPrice: number | null = null;
    let exitReason: BreakoutExitReason | null = null;
    let exitIdx = -1;
    let highestSinceEntry = high[entryIdx]; // 跟踪止损用：持仓期间最高价

    for (let j = entryIdx; j < n; j += 1) {
      if (high[j] > highestSinceEntry) highestSinceEntry = high[j];
      if (open[j] <= stop) {
        exitPrice = open[j];
        exitReason = "STOP_GAP";
      } else if (open[j] >= target) {
        exitPrice = open[j];
        exitReason = "TARGET_GAP";
      } else {
        const hitStop = low[j] <= stop;
        const hitTarget = high[j] >= target;
        if (hitStop && hitTarget) {
          exitPrice = stop;
          exitReason = "STOP_BOTH"; // 保守：先打止损
        } else if (hitStop) {
          exitPrice = stop;
          exitReason = "STOP";
        } else if (hitTarget) {
          exitPrice = target;
          exitReason = "TARGET";
        } else if (exitMode === "ma" && j > entryIdx) {
          const maFastJ = sma(close, j + 1, maFast);
          if (maFastJ !== null && close[j] < maFastJ) {
            exitPrice = close[j];
            exitReason = "MA_EXIT";
          }
        } else if (exitMode === "trailing" && j > entryIdx) {
          // 跟踪止损：从持仓最高价回撤 trailingPct 触发，按收盘离场
          const trailLevel = highestSinceEntry * (1 - trailingPct);
          if (close[j] <= trailLevel) {
            exitPrice = close[j];
            exitReason = "TRAIL";
          }
        }
        // exitMode === "target"：不做提前离场，只靠固定止损/止盈
      }
      if (exitPrice !== null) {
        exitIdx = j;
        break;
      }
    }

    if (exitPrice === null) {
      exitPrice = close[n - 1];
      exitReason = "EOD";
      exitIdx = n - 1;
    }

    const r = rps > 0 ? (exitPrice - entry) / rps : 0;
    trades.push({
      symbol,
      entryDate: clean[entryIdx].date,
      exitDate: clean[exitIdx].date,
      entry: round2(entry),
      stop: round2(stop),
      target: round2(target),
      exit: round2(exitPrice),
      r: round3(r),
      reason: exitReason as BreakoutExitReason,
      bars: exitIdx - entryIdx,
    });

    i = exitIdx + 1; // 平仓后再找下一个信号（同标的不重叠持仓）
  }

  return { symbol, params, trades, stats: computeBreakoutStats(trades), warnings };
}

/** 把多只标的的成交合并统计（组合层面的单笔统计，不做资金占用模拟）。 */
export function computeBreakoutStats(
  trades: BreakoutTrade[],
): BreakoutStats | null {
  if (!trades.length) return null;
  const rs = trades.map((t) => t.r);
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const grossWin = wins.reduce((s, r) => s + r, 0);
  const grossLoss = -losses.reduce((s, r) => s + r, 0);

  let maxCl = 0;
  let cl = 0;
  for (const r of rs) {
    if (r <= 0) {
      cl += 1;
      if (cl > maxCl) maxCl = cl;
    } else {
      cl = 0;
    }
  }

  const exitReasonCounts: Record<string, number> = {};
  for (const t of trades) {
    exitReasonCounts[t.reason] = (exitReasonCounts[t.reason] || 0) + 1;
  }

  const avgWinR = wins.length ? grossWin / wins.length : 0;
  const avgLossR = losses.length ? losses.reduce((s, r) => s + r, 0) / losses.length : 0;

  return {
    trades: trades.length,
    winRate: (wins.length / trades.length) * 100,
    avgWinR: round3(avgWinR),
    avgLossR: round3(avgLossR),
    payoff: avgLossR !== 0 ? round2(avgWinR / Math.abs(avgLossR)) : Infinity,
    expectancy: round3(rs.reduce((s, r) => s + r, 0) / rs.length),
    profitFactor: grossLoss > 0 ? round2(grossWin / grossLoss) : Infinity,
    maxConsecutiveLosses: maxCl,
    avgHoldBars: round2(trades.reduce((s, t) => s + t.bars, 0) / trades.length),
    bestR: round3(Math.max(...rs)),
    worstR: round3(Math.min(...rs)),
    totalR: round3(rs.reduce((s, r) => s + r, 0)),
    exitReasonCounts,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
