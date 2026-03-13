import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import type { StrategyLabRunInput } from "@/src/daa/modules/strategyLab/strategyLabContracts";
import { StrategyLabValidationError, runStrategyLab } from "@/src/daa/modules/strategyLab/strategyLabService";
import { createMarketDataClient } from "@/src/market/marketDataClient";

export const runtime = "nodejs";

function buildForwardedMarketHeaders(req: Request): HeadersInit | undefined {
  const cookie = req.headers.get("cookie")?.trim();
  const authorization = req.headers.get("authorization")?.trim();
  const requestId = req.headers.get("x-request-id")?.trim();

  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  if (requestId) headers.set("x-request-id", requestId);

  return [...headers.keys()].length > 0 ? headers : undefined;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<StrategyLabRunInput>(req);
    const assets = Array.isArray(body?.assets) ? body.assets : [];
    if (!assets.length) {
      return fail("VALIDATION_FAILED", "请至少选择 1 个研究资产后再运行策略实验室。", {
        status: 400,
        details: {
          code: "EMPTY_ASSETS",
        },
      });
    }

    const endpointBase = new URL(req.url).origin;
    const marketDataClient = createMarketDataClient({
      endpointBase,
      headers: buildForwardedMarketHeaders(req),
    });

    try {
      const data = await runStrategyLab({
        assets,
        startDate: String(body?.startDate || "").trim(),
        endDate: String(body?.endDate || "").trim(),
        benchmarkSymbol: String(body?.benchmarkSymbol || "").trim() || undefined,
        alignmentMode: body?.alignmentMode,
        minBars: Number(body?.minBars),
        lookbackBars: Number(body?.lookbackBars),
        baseCurrency: String(body?.baseCurrency || "").trim() || undefined,
        ensembleConfig: body?.ensembleConfig,
        initialEquity: Number(body?.initialEquity),
        constraints: body?.constraints,
        policy: body?.policy,
        execution: body?.execution,
      }, { endpointBase, marketDataClient });

      return ok(data);
    } catch (error) {
      if (error instanceof StrategyLabValidationError) {
        return fail("VALIDATION_FAILED", error.message, {
          status: error.status,
          details: {
            code: error.code,
            ...(error.details || {}),
          },
        });
      }
      throw error;
    }
  });
}
