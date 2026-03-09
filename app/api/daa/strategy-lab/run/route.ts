import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import type { StrategyLabRunInputV1 } from "@/src/daa/modules/strategyLab/strategyLabContractsV1";
import { StrategyLabValidationErrorV1, runStrategyLabV1 } from "@/src/daa/modules/strategyLab/strategyLabServiceV1";

export const runtime = "nodejs";

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
      }, { endpointBase });

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
