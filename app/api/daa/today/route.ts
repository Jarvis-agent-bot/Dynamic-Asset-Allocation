/**
 * GET  /api/daa/today          — 读取缓存的今日决策
 * POST /api/daa/today          — 记录用户决策（采纳/忽略/稍后）
 * PUT  /api/daa/today          — 手动刷新 LLM 决策（即时调用）
 */

export const runtime = "nodejs";

import { withApiHandler, ok, fail, readJsonBody } from "@/src/daa/api/routeHelpers";
import { buildWorkbenchBootstrapBundle } from "@/src/daa/modules/workbench/workbenchReadService";
import { buildTodayDecisionContext } from "@/src/daa/modules/today/todayDecisionContext";
import { generateTodayDecision } from "@/src/daa/modules/today/todayLlmPrompt";
import {
  getLatestTodayCache,
  listRecentDecisions,
  insertDecisionLog,
  upsertTodayCache,
} from "@/src/daa/store/todayStore";
import { batchReadAssetPriceSnapshots } from "@/src/daa/store/assetUniverseStore";
import { computeDecisionStats } from "@/src/daa/modules/today/decisionOutcomeService";
import type { TodayReadModel } from "@/src/daa/modules/today/todayTypes";

// ─────────────────────────────────────────────────────────────────────────────
// GET — 读取缓存
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return withApiHandler(async () => {
    const [cache, decisions] = await Promise.all([
      getLatestTodayCache(),
      listRecentDecisions("default", 10),
    ]);

    if (!cache) {
      // 首次访问，无缓存，触发一次即时计算
      const model = await buildFreshTodayModel(decisions);
      return ok(model);
    }

    // 判断是否 stale（超过 2 小时）
    const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
    const isStale = cache.isStale || ageMs > 2 * 60 * 60 * 1000;

    const model: TodayReadModel = {
      decisionContext: cache.decisionContext,
      llmOutput: isStale
        ? { ...cache.llmOutput, status: "cached" }
        : cache.llmOutput,
      portfolioHealth: extractPortfolioHealth(cache.decisionContext),
      recentDecisions: decisions,
      decisionStats: computeDecisionStats(decisions),
      cachedAt: cache.cachedAt,
      isStale,
    };
    return ok(model);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — 记录用户决策
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const body = await readJsonBody<{
      assetKey: string;
      conclusion: string;
      userAction: string;
      llmReason?: string;
    }>(req);

    if (!body?.assetKey || !body.conclusion || !body.userAction) {
      return fail("VALIDATION_FAILED", "缺少必填字段: assetKey, conclusion, userAction");
    }

    const validActions = ["adopted", "ignored", "deferred"];
    const validConclusions = ["act", "watch", "hold"];

    if (!validActions.includes(body.userAction)) {
      return fail("VALIDATION_FAILED", `userAction 须为: ${validActions.join(", ")}`);
    }
    if (!validConclusions.includes(body.conclusion)) {
      return fail("VALIDATION_FAILED", `conclusion 须为: ${validConclusions.join(", ")}`);
    }

    // 记录决策时的价格快照（供后验使用）
    const priceSnaps = await batchReadAssetPriceSnapshots([body.assetKey]);
    const priceAtDecision = priceSnaps[0]?.lastPrice ?? null;

    await insertDecisionLog({
      assetKey: body.assetKey,
      conclusion: body.conclusion as "act" | "watch" | "hold",
      userAction: body.userAction as "adopted" | "ignored" | "deferred",
      llmReason: body.llmReason,
      signalSnapshot: { priceAtDecision, recordedAt: new Date().toISOString() },
    });

    return ok({ recorded: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — 手动刷新
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT() {
  return withApiHandler(async () => {
    const decisions = await listRecentDecisions("default", 10);
    const model = await buildFreshTodayModel(decisions);
    return ok(model);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function buildFreshTodayModel(
  decisions: Awaited<ReturnType<typeof listRecentDecisions>>,
): Promise<TodayReadModel> {
  const { bootstrap } = await buildWorkbenchBootstrapBundle({
    syncPrices: false,
    autoRiskCycle: false,
  });
  const decisionContext = buildTodayDecisionContext(bootstrap, decisions);
  const llmOutput = await generateTodayDecision(decisionContext);

  // 缓存结果
  await upsertTodayCache({ decisionContext, llmOutput });

  return {
    decisionContext,
    llmOutput,
    portfolioHealth: extractPortfolioHealth(decisionContext),
    recentDecisions: decisions,
    decisionStats: computeDecisionStats(decisions),
    cachedAt: new Date().toISOString(),
    isStale: false,
  };
}

function extractPortfolioHealth(ctx: TodayReadModel["decisionContext"]): TodayReadModel["portfolioHealth"] {
  return {
    totalEquity: ctx.portfolioState.totalEquity,
    equityDeltaDay: null, // 需要 snapshots 数据，Phase 2 增强
    equityDeltaDayPct: null,
    hhi: ctx.riskConstraints.hhi,
    concentrationLevel: ctx.riskConstraints.concentrationLevel,
    maxDrawdown: null, // Phase 2
  };
}
