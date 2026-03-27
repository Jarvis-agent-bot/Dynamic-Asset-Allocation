import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { runStrategyLabBacktest } from "@/src/daa/modules/strategyLab/strategyLabService";

export const runtime = "nodejs";

type Body = {
  assets?: unknown;
  strategies?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  rebalanceFrequency?: unknown;
  initialCapital?: unknown;
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

    const initialCapital = Number(body.initialCapital);
    if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
      return fail("VALIDATION_FAILED", "initialCapital 必须为正数", { status: 400 });
    }

    const rebalanceFrequency = String(body.rebalanceFrequency || "monthly").trim();
    const benchmarkSymbol = body.benchmarkSymbol ? String(body.benchmarkSymbol).trim() : undefined;
    const feeRateBps = Number.isFinite(Number(body.feeRateBps)) ? Number(body.feeRateBps) : undefined;
    const slippageBps = Number.isFinite(Number(body.slippageBps)) ? Number(body.slippageBps) : undefined;

    const result = await runStrategyLabBacktest({
      assets,
      strategies,
      startDate,
      endDate,
      rebalanceFrequency,
      initialCapital,
      benchmarkSymbol,
      feeRateBps,
      slippageBps,
    });

    return ok(result);
  });
}
