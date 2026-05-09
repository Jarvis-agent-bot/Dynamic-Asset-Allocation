import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildViewerReadRouteResponse, parseIntegerSearchParam } from "@/src/daa/modules/read/readRouteHelpers";
import { buildTradesReadModel } from "@/src/daa/modules/read/tradesReadService";
import type { TradesReadModel } from "@/src/daa/modules/read/readModels";

export const runtime = "nodejs";

function applyTradeFilters(model: TradesReadModel, searchParams: URLSearchParams): TradesReadModel {
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const symbol = searchParams.get("symbol");
  const side = searchParams.get("side");
  const status = searchParams.get("status");

  if (!startDate && !endDate && !symbol && !side && !status) return model;

  const startTs = startDate ? Date.parse(startDate) : Number.NaN;
  const endTs = endDate ? Date.parse(endDate) : Number.NaN;
  const symbolLower = symbol?.toLowerCase() ?? null;
  const sideUpper = side?.toUpperCase() ?? null;
  const statusLower = status?.toLowerCase() ?? null;

  let filteredOrders = model.records.orders;

  if (Number.isFinite(startTs)) {
    filteredOrders = filteredOrders.filter((o) => Date.parse(o.updatedAt) >= startTs);
  }
  if (Number.isFinite(endTs)) {
    filteredOrders = filteredOrders.filter((o) => Date.parse(o.updatedAt) <= endTs);
  }
  if (symbolLower) {
    filteredOrders = filteredOrders.filter((o) => o.symbol.toLowerCase().includes(symbolLower));
  }
  if (sideUpper) {
    filteredOrders = filteredOrders.filter((o) => o.side.toUpperCase() === sideUpper);
  }
  if (statusLower) {
    filteredOrders = filteredOrders.filter((o) => o.status.toLowerCase() === statusLower);
  }

  // Also filter cycles by date range if provided
  let filteredCycles = model.records.cycles;
  if (Number.isFinite(startTs)) {
    filteredCycles = filteredCycles.filter((c) => Date.parse(c.createdAt) >= startTs);
  }
  if (Number.isFinite(endTs)) {
    filteredCycles = filteredCycles.filter((c) => Date.parse(c.createdAt) <= endTs);
  }

  return {
    ...model,
    records: {
      cycles: filteredCycles,
      orders: filteredOrders,
    },
  };
}

export async function GET(req: Request) {
  return withApiHandler(() => buildViewerReadRouteResponse(req, {
    load: async (searchParams) => {
      const model = await buildTradesReadModel({
        tradeLimit: parseIntegerSearchParam(searchParams.get("tradeLimit"), 150),
        reportLimit: parseIntegerSearchParam(searchParams.get("reportLimit"), 120),
      });
      return applyTradeFilters(model, searchParams);
    },
  }));
}
