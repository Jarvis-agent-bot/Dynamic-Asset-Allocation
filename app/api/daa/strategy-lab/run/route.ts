import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { assertIsoDateString } from "@/src/core/isoDate";
import { normalizeBaseCurrencyCode } from "@/src/daa/config/currency";
import { runStrategyLabBacktest, StrategyLabDomainError } from "@/src/daa/modules/strategyLab/strategyLabService";

export const runtime = "nodejs";

type Body = {
  assets?: unknown;
  strategies?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  rebalanceFrequency?: unknown;
  initialCapital?: unknown;
  baseCurrency?: unknown;
  benchmarkSymbol?: unknown;
  feeRateBps?: unknown;
  slippageBps?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    if (!body) return fail("VALIDATION_FAILED", "请求体不是有效的 JSON", { status: 400 });

    const assets = Array.isArray(body.assets)
      ? body.assets.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    if (!assets.length) return fail("VALIDATION_FAILED", "assets 不能为空", { status: 400 });

    const strategies = Array.isArray(body.strategies)
      ? body.strategies.map((item) => String(item || "").trim()).filter(Boolean)
      : ["equalWeight"];

    const startDate = String(body.startDate || "").trim();
    const endDate = String(body.endDate || "").trim();
    if (!startDate || !endDate) {
      return fail("VALIDATION_FAILED", "startDate 和 endDate 不能为空", { status: 400 });
    }
    try {
      assertIsoDateString(startDate, "startDate");
      assertIsoDateString(endDate, "endDate");
    } catch (error) {
      return fail("VALIDATION_FAILED", error instanceof Error ? error.message : "日期格式无效", { status: 400 });
    }
    if (endDate < startDate) {
      return fail("VALIDATION_FAILED", "endDate 必须大于等于 startDate", { status: 400 });
    }

    const initialCapital = Number(body.initialCapital);
    if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
      return fail("VALIDATION_FAILED", "initialCapital 必须为正数", { status: 400 });
    }

    const rebalanceFrequency = String(body.rebalanceFrequency || "monthly").trim();
    const baseCurrency = normalizeBaseCurrencyCode(body.baseCurrency, "USD");
    const benchmarkSymbol = body.benchmarkSymbol ? String(body.benchmarkSymbol).trim() : undefined;
    const feeRateBps = Number.isFinite(Number(body.feeRateBps)) ? Number(body.feeRateBps) : undefined;
    const slippageBps = Number.isFinite(Number(body.slippageBps)) ? Number(body.slippageBps) : undefined;

    let result;
    try {
      result = await runStrategyLabBacktest({
        assets,
        strategies,
        startDate,
        endDate,
        rebalanceFrequency,
        initialCapital,
        baseCurrency,
        benchmarkSymbol,
        feeRateBps,
        slippageBps,
      });
    } catch (error) {
      if (error instanceof StrategyLabDomainError) {
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

    return ok(result);
  });
}
