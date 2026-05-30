import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { assertIsoDateString } from "@/src/core/isoDate";
import {
  runBreakoutLabBacktest,
  BreakoutLabDomainError,
  type BreakoutLabRunParams,
} from "@/src/daa/modules/strategyLab/breakoutLabService";

export const runtime = "nodejs";

type Body = {
  assets?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  initialCapital?: unknown;
  riskPct?: unknown;
  maxSlots?: unknown;
  maxPositionUsd?: unknown;
  strategy?: Record<string, unknown>;
};

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

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

    const startDate = String(body.startDate || "").trim();
    const endDate = String(body.endDate || "").trim();
    if (!startDate || !endDate) return fail("VALIDATION_FAILED", "startDate 和 endDate 不能为空", { status: 400 });
    try {
      assertIsoDateString(startDate, "startDate");
      assertIsoDateString(endDate, "endDate");
    } catch (error) {
      return fail("VALIDATION_FAILED", error instanceof Error ? error.message : "日期格式无效", { status: 400 });
    }
    if (endDate < startDate) return fail("VALIDATION_FAILED", "endDate 必须大于等于 startDate", { status: 400 });

    const initialCapital = Number(body.initialCapital);
    if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
      return fail("VALIDATION_FAILED", "initialCapital 必须为正数", { status: 400 });
    }

    // 策略参数白名单
    const s = body.strategy || {};
    const strategy: BreakoutLabRunParams["strategy"] = {};
    const breakoutLookback = num(s.breakoutLookback);
    const volMultiple = num(s.volMultiple);
    const maFast = num(s.maFast);
    const maSlow = num(s.maSlow);
    const maxExtensionPct = num(s.maxExtensionPct);
    const stopPct = num(s.stopPct);
    const rewardMultiple = num(s.rewardMultiple);
    if (breakoutLookback !== undefined) strategy.breakoutLookback = Math.max(2, Math.trunc(breakoutLookback));
    if (volMultiple !== undefined) strategy.volMultiple = Math.max(0, volMultiple);
    if (maFast !== undefined) strategy.maFast = Math.max(2, Math.trunc(maFast));
    if (maSlow !== undefined) strategy.maSlow = Math.max(3, Math.trunc(maSlow));
    if (maxExtensionPct !== undefined) strategy.maxExtensionPct = Math.max(0, maxExtensionPct);
    if (stopPct !== undefined) strategy.stopPct = Math.min(0.5, Math.max(0.01, stopPct));
    if (rewardMultiple !== undefined) strategy.rewardMultiple = Math.max(0.5, rewardMultiple);
    if (typeof s.useMaExit === "boolean") strategy.useMaExit = s.useMaExit;
    if (s.exitMode === "ma" || s.exitMode === "trailing" || s.exitMode === "target") {
      strategy.exitMode = s.exitMode;
    }
    const trailingPct = num(s.trailingPct);
    if (trailingPct !== undefined) strategy.trailingPct = Math.min(0.5, Math.max(0.02, trailingPct));

    const params: BreakoutLabRunParams = {
      assets,
      startDate,
      endDate,
      initialCapital,
      riskPct: num(body.riskPct),
      maxSlots: num(body.maxSlots) !== undefined ? Math.max(1, Math.trunc(num(body.maxSlots)!)) : undefined,
      maxPositionUsd: num(body.maxPositionUsd),
      strategy,
    };

    try {
      const result = await runBreakoutLabBacktest(params);
      return ok(result);
    } catch (error) {
      if (error instanceof BreakoutLabDomainError) {
        return fail("VALIDATION_FAILED", error.message, {
          status: error.status,
          details: { code: error.code, ...(error.details || {}) },
        });
      }
      throw error;
    }
  });
}
