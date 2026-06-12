import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadModelService";
import { fetchMultiplePriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type EquityPoint = { label: string; date: string; equity: number };
/** TWR 点：portfolio + 动态附加的基准归一化值（如 benchmarkSpy） */
type TwrPoint = { label: string; date: string; portfolio: number; [benchmarkKey: string]: string | number };
type CashFlowEvent = { ts: string; side: "deposit" | "withdraw"; amount: number };

type BenchmarkMeta = { key: string; label: string; changePct: number | null };

/** 收益率模式下叠加的对比基准（Yahoo symbol → series key + 展示名） */
const BENCHMARK_DEFS: ReadonlyArray<{ symbol: string; key: string; label: string }> = [
  { symbol: "SPY", key: "benchmarkSpy", label: "标普500" },
  { symbol: "QQQ", key: "benchmarkQqq", label: "纳斯达克100" },
];

/**
 * 把基准收盘价序列归一化（起点=100）后就地叠加到 TWR series 上。
 *
 * - 与组合曲线同起点对齐：基准点取组合首日当天或之前最近的交易日收盘价。
 * - 前向填充：组合的每个日期匹配 ≤ 该日期的最近基准收盘价，
 *   周末/节假日无报价时沿用上一交易日，保证两条线日期一一对应。
 */
function overlayBenchmarks(
  series: TwrPoint[],
  benches: Array<{ key: string; label: string; points: { date: string; close: number }[] }>,
): BenchmarkMeta[] {
  const metas: BenchmarkMeta[] = [];
  if (series.length === 0) return metas;
  const baseDate = series[0].date;

  for (const bench of benches) {
    const sorted = [...bench.points]
      .filter((p) => p.close > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (sorted.length === 0) continue;

    // 基准收盘价：起点当天或之前最近一个交易日
    let baseClose = 0;
    for (const p of sorted) {
      if (p.date <= baseDate) baseClose = p.close;
      else break;
    }
    if (baseClose <= 0) baseClose = sorted[0].close; // 起点早于最早报价时退用最早一条
    if (baseClose <= 0) continue;

    let idx = 0;
    let lastClose = 0;
    let lastNorm: number | null = null;

    for (const point of series) {
      while (idx < sorted.length && sorted[idx].date <= point.date) {
        lastClose = sorted[idx].close;
        idx += 1;
      }
      if (lastClose > 0) {
        lastNorm = +((lastClose / baseClose) * 100).toFixed(2);
        point[bench.key] = lastNorm;
      }
    }

    metas.push({
      key: bench.key,
      label: bench.label,
      changePct: lastNorm != null ? +(lastNorm - 100).toFixed(2) : null,
    });
  }

  return metas;
}

/**
 * GET /api/daa/read/performance-chart?mode=equity&days=0
 *
 * 返回预计算的组合曲线数据，前端不再需要自行计算 TWR。
 * mode=equity → 实际金额, mode=twr → TWR 归一化 (100=起始)
 */
export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") === "twr" ? "twr" : "equity";
    const days = Math.max(0, Number(url.searchParams.get("days")) || 0);

    const readModel = await buildWorkbenchReadModel({ syncPrices: false, autoRiskCycle: false });
    const snapshots = readModel.snapshots || [];
    const cashLedger = readModel.cashLedger || [];

    // 过滤现金流事件
    const cashFlowEvents: CashFlowEvent[] = cashLedger
      .filter((e) => (e.side === "deposit" || e.side === "withdraw") && e.entryKind === "manual")
      .map((e) => ({ ts: e.ts, side: e.side as "deposit" | "withdraw", amount: e.amountInAccountBase ?? e.amount }));

    const sorted = [...snapshots].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const cutoff = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
    const filtered = cutoff ? sorted.filter((s) => s.ts >= cutoff) : sorted;
    const meaningful = filtered.filter((s) => s.totalEquity > 0);

    if (meaningful.length < 2) {
      return ok({ mode, days, series: [], changePct: null });
    }

    if (mode === "equity") {
      const series: EquityPoint[] = meaningful.map((s) => ({
        label: s.ts.slice(5, 10),
        date: s.ts.slice(0, 10),
        equity: +s.totalEquity.toFixed(2),
      }));
      const first = series[0].equity;
      const last = series[series.length - 1].equity;
      const changePct = first > 0 ? +((last - first) / first * 100).toFixed(2) : 0;
      return ok({ mode, days, series, changePct, lastEquity: last });
    }

    // TWR 计算
    const cfMap = new Map<string, number>();
    for (const cf of cashFlowEvents) {
      const dateKey = cf.ts.slice(0, 10);
      const prev = cfMap.get(dateKey) ?? 0;
      cfMap.set(dateKey, prev + (cf.side === "deposit" ? cf.amount : -cf.amount));
    }

    let cumFactor = 1;
    let prevEquity = meaningful[0].totalEquity;
    const firstDate = meaningful[0].ts.slice(0, 10);
    const consumedDates = new Set<string>([firstDate]);

    const series: TwrPoint[] = meaningful.map((snap, i) => {
      const dateKey = snap.ts.slice(0, 10);

      if (i === 0) {
        prevEquity = snap.totalEquity;
        return { label: snap.ts.slice(5, 10), date: dateKey, portfolio: 100 };
      }

      let netCashFlow = 0;
      if (!consumedDates.has(dateKey) && cfMap.has(dateKey)) {
        netCashFlow = cfMap.get(dateKey)!;
        consumedDates.add(dateKey);
      }

      const adjEquity = snap.totalEquity - netCashFlow;
      const subReturn = prevEquity > 0 && adjEquity > 0 ? adjEquity / prevEquity : 1;
      cumFactor *= subReturn;
      prevEquity = snap.totalEquity;

      return { label: snap.ts.slice(5, 10), date: dateKey, portfolio: +(cumFactor * 100).toFixed(2) };
    });

    const changePct = series.length > 0 ? +(series[series.length - 1].portfolio - 100).toFixed(2) : 0;

    // 叠加对比基准：标普500 / 纳斯达克100（同图归一化曲线）
    let benchmarks: BenchmarkMeta[] = [];
    if (series.length >= 2) {
      try {
        const startDate = series[0].date;
        const priceResults = await fetchMultiplePriceSeriesWithCache(
          BENCHMARK_DEFS.map((b) => b.symbol),
          startDate,
          { market: "US", currency: "USD", minDbDays: 2, maxStaleDays: 1, timeoutMs: 8000 },
        );
        const bySymbol = new Map(priceResults.map((r) => [r.symbol.toUpperCase(), r]));
        const benches = BENCHMARK_DEFS.map((def) => ({
          key: def.key,
          label: def.label,
          points: (bySymbol.get(def.symbol.toUpperCase())?.data ?? []).map((p) => ({ date: p.date.slice(0, 10), close: p.close })),
        })).filter((b) => b.points.length > 0);
        benchmarks = overlayBenchmarks(series, benches);
      } catch (error) {
        logSwallowed("performanceChart.benchmarks", error);
      }
    }

    return ok({ mode, days, series, changePct, benchmarks });
  });
}
