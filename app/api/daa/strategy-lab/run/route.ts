import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import type { StrategyLabRunInputV1 } from "@/src/daa/modules/strategyLab/strategyLabContractsV1";
import { StrategyLabValidationErrorV1, runStrategyLabV1 } from "@/src/daa/modules/strategyLab/strategyLabServiceV1";
import { createMarketDataClient } from "@/src/market/marketDataClient";

export const runtime = "nodejs";

function buildForwardedMarketHeadersV1(req: Request): HeadersInit | undefined {
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
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<StrategyLabRunInputV1>(req);
    const assets = Array.isArray(body?.assets) ? body.assets : [];
    if (!assets.length) {
      return failV1("VALIDATION_FAILED", "请至少选择 1 个研究资产后再运行策略实验室。", {
        status: 400,
        details: {
          code: "EMPTY_ASSETS",
        },
      });
    }

    const endpointBase = new URL(req.url).origin;
    const marketDataClient = createMarketDataClient({
      endpointBase,
      headers: buildForwardedMarketHeadersV1(req),
    });

    try {
      const data = await runStrategyLabV1({
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

      return okV1(data);
    } catch (error) {
      if (error instanceof StrategyLabValidationErrorV1) {
        return failV1("VALIDATION_FAILED", error.message, {
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
