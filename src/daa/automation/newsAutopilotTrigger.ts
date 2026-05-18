import { runAutopilotLoop } from "@/src/daa/agent/autopilotOrchestrator";
import { runIdempotentAccountScopedCronJob } from "@/src/daa/cron/accountCronScope";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import { getZonedYmd, normalizeTimeZoneOrUtc } from "@/src/daa/modules/workbench/reviewSchedule";

type NewsAutopilotSource = "cron_news_refresh" | "alpaca_ws_realtime";

function buildDailyNewsAutopilotKey(now = new Date(), timeZone = "UTC"): string {
  const zoned = getZonedYmd(now, normalizeTimeZoneOrUtc(timeZone));
  const dayKey = `${zoned.year}-${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`;
  return `cron_news_autopilot:${dayKey}`;
}

export function isActionableNewsForAutopilot(input: {
  impact?: unknown;
  actionHint?: unknown;
}): boolean {
  const impact = String(input.impact || "").trim().toLowerCase();
  const actionHint = String(input.actionHint || "").trim();
  return impact === "high" || impact === "medium" || actionHint === "警惕";
}

export async function runNewsAutopilotDaily(input: {
  req: Request;
  source: NewsAutopilotSource;
  reason: string;
  affectedSymbols: string[];
}): Promise<Record<string, unknown>> {
  const system = await getDaaSystemConfig();
  const policy = resolvePolicyConfig(system.config);
  const timeZone = normalizeTimeZoneOrUtc(policy.review.timezone);
  const idempotencyKey = buildDailyNewsAutopilotKey(new Date(), timeZone);

  const execution = await runIdempotentAccountScopedCronJob<Record<string, unknown>>({
    req: input.req,
    jobType: "cron_news_autopilot",
    triggerSource: input.source,
    idempotencyKey,
    duplicateWindowMinutes: 36 * 60,
    duplicateReason: "news autopilot already ran today",
    summarize: (result) => ({
      skipped: result.skipped,
      reason: result.reason,
      rebalanceCycleId: (result.rebalance as { cycleId?: unknown } | undefined)?.cycleId ?? null,
      proposalCount: (result.rebalance as { proposalCount?: unknown } | undefined)?.proposalCount ?? 0,
      autoExecutedOrders: (
        (result.rebalance as { autoExecute?: { ordersCount?: unknown } } | undefined)?.autoExecute?.ordersCount
      ) ?? 0,
      targetWeightPoolPersisted: (
        (result.targetWeightPool as { persistedCount?: unknown } | undefined)?.persistedCount
      ) ?? 0,
      targetWeightPoolFailed: (
        (result.targetWeightPool as { failedCount?: unknown } | undefined)?.failedCount
      ) ?? 0,
    }),
    handler: async () => runAutopilotLoop({
      source: input.source,
      reason: input.reason,
      affectedSymbols: input.affectedSymbols,
    }) as unknown as Record<string, unknown>,
  });

  const duplicateOf = (execution as { duplicateOf?: unknown }).duplicateOf;
  if (duplicateOf) {
    return {
      attempted: false,
      skipped: true,
      reason: execution.reason || "news autopilot already ran today",
      duplicateOf,
      idempotencyKey,
      timeZone,
      jobId: execution.jobId,
      requestId: execution.requestId,
    };
  }

  return {
    ...execution,
    attempted: true,
    autopilotJobId: execution.jobId,
    autopilotDurationMs: execution.durationMs,
    idempotencyKey,
    timeZone,
  };
}
