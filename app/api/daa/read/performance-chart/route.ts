import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadService";

export const runtime = "nodejs";

type EquityPoint = { label: string; date: string; equity: number };
type TwrPoint = { label: string; date: string; portfolio: number };
type CashFlowEvent = { ts: string; side: "deposit" | "withdraw"; amount: number };

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
    return ok({ mode, days, series, changePct });
  });
}
