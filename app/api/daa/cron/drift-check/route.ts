import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { getLatestHumanSignalBatchV1 } from "@/src/daa/hf/hfServiceV1";
import { sendTelegramByEnvV1 } from "@/src/daa/notify/telegramV1";
import {
  createDaaRebalanceDecisionV1,
  DEFAULT_STRATEGY_CONFIG_V1,
  getDaaNotificationConfigV1,
  getDaaStrategyConfigV1,
  listDaaPositionsV1,
} from "@/src/daa/store/daaStorePgV1";
import { buildDaaUnifiedPlanV1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

export const runtime = "nodejs";

function toObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const positions = await listDaaPositionsV1();
    const strategy = await getDaaStrategyConfigV1();
    const strategyObj = toObject(strategy.configJson);
    const defaults = DEFAULT_STRATEGY_CONFIG_V1 as Record<string, any>;

    const account = { ...defaults.account, ...toObject(strategyObj.account) };
    const constraints = { ...defaults.constraints, ...toObject(strategyObj.constraints) };
    const policy = { ...defaults.policy, ...toObject(strategyObj.policy) };
    const risk = { ...toObject((defaults as any).risk), ...toObject(strategyObj.risk) };
    const targetWeights = { ...toObject(defaults.targetWeights), ...toObject(strategyObj.targetWeights) };

    const symbols = new Set<string>(Object.keys(targetWeights).map((x) => String(x || "").trim().toUpperCase()).filter(Boolean));
    for (const position of positions) symbols.add(position.symbol);

    const batch = await getLatestHumanSignalBatchV1({ symbols: [...symbols] });

    const requestPayload: DaaUnifiedRequestV1 = {
      account: {
        cash: toNum(account.cash, 0),
        totalEquity: account.totalEquity == null ? undefined : toNum(account.totalEquity, 0),
      },
      constraints: {
        maxPositionPct: toNum(constraints.maxPositionPct, 1),
        minNotional: toNum(constraints.minNotional, 200),
        maxOrderPctOfNav: toNum(constraints.maxOrderPctOfNav, 0.1),
        maxOrderPctOfLiquidity: toNum(constraints.maxOrderPctOfLiquidity, 0.15),
      },
      policy: {
        baseDriftTriggerPct: toNum(policy.baseDriftTriggerPct, 0.05),
        strongTrendDriftTriggerPct: toNum(policy.strongTrendDriftTriggerPct, 0.1),
        riskOffConsensusPct: toNum(policy.riskOffConsensusPct, 0.6),
        riskOffScalePct: toNum(policy.riskOffScalePct, 0.7),
        valueTrapThesisDriftPct: toNum(policy.valueTrapThesisDriftPct, 0.12),
        sbIsolationScorePct: toNum(policy.sbIsolationScorePct, 0.35),
      },
      risk: {
        maxDrawdownPct: toNum((risk as any).maxDrawdownPct, 0.15),
        perAssetStopLossPct: toNum((risk as any).perAssetStopLossPct, 0.2),
        maxConcentrationPct: toNum((risk as any).maxConcentrationPct, 0.3),
        correlationCapPct: toNum((risk as any).correlationCapPct, 0.6),
        maxTotalRiskExposurePct: toNum((risk as any).maxTotalRiskExposurePct, 0.7),
      },
      targetWeights: Object.fromEntries(
        Object.entries(targetWeights)
          .map(([key, value]) => [String(key || "").trim().toUpperCase(), toNum(value, 0)] as const)
          .filter(([key, value]) => Boolean(key) && value > 0),
      ),
      positions: positions.map((position) => ({
        symbol: position.symbol,
        market: position.market,
        currency: position.currency,
        qty: position.qty,
        price: position.price,
        tags: position.tags,
        liquidityNotional24h: position.liquidityNotional24h,
      })),
      humanSignals: batch.signals.map((signal) => ({
        symbol: signal.symbol,
        aggregatedScorePct: signal.aggregatedScorePct,
        convictionPct: signal.convictionPct,
        thesisDriftPct: signal.thesisDriftPct,
        confidencePct: signal.confidencePct,
        momentumRegime: signal.momentumRegime,
        stance: signal.stance,
        riskTags: signal.riskTags,
        sourceRefs: signal.sourceRefs,
      })),
    };

    const plan = buildDaaUnifiedPlanV1(requestPayload);
    const created = await createDaaRebalanceDecisionV1({
      requestJson: requestPayload as unknown as Record<string, unknown>,
      responseJson: plan as unknown as Record<string, unknown>,
      shouldRebalance: Boolean(plan.summary.shouldRebalance),
      triggerSource: "cron_drift",
    });

    try {
      const notifyConfig = await getDaaNotificationConfigV1();
      if (notifyConfig.enabled && notifyConfig.notifyOnDrift && plan.summary.shouldRebalance) {
        await sendTelegramByEnvV1(
          [
            "*DAA 漂移检查触发再平衡*",
            `Decision: ${created.decision.id}`,
            `可执行订单: ${plan.summary.executableOrderCount}`,
            `阻断订单: ${plan.summary.blockedOrderCount}`,
            `阈值: ${(plan.summary.triggerThresholdPct * 100).toFixed(2)}%`,
          ].join("\n"),
        );
      }
    } catch {
      // 通知失败不阻塞主流程
    }

    return okV1({
      decisionId: created.decision.id,
      shouldRebalance: plan.summary.shouldRebalance,
      executableOrderCount: plan.summary.executableOrderCount,
      blockedOrderCount: plan.summary.blockedOrderCount,
      generatedAt: plan.generatedAt,
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
